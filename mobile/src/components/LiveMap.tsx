import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { WebView as NativeWebView } from 'react-native-webview';
import { APP_CONFIG } from '../constants';
import { colors, radius } from '../theme';
import type { LatLng } from '../types';

const WebView = NativeWebView as unknown as React.ComponentType<any>;
// react-native-maps' Animated marker typings lag RN 0.88's Animated types; props are checked by the native component.
const ChefMarker = MarkerAnimated as unknown as React.ComponentType<any>;

/** Longest gap that is animated (E7). A longer gap jumps: drawing a slide over it would invent a path. */
const MAX_TWEEN_MS = 6_000;

interface LiveMapProps {
  destination: LatLng;
  /** Latest real fix from the server; undefined when none is available. */
  chef?: LatLng;
  /** true when the fix is older than the stale threshold: shown greyed as "last seen", never animated. */
  stale?: boolean;
  /** Server timestamp of the fix, used to size the animation to the real gap between fixes. */
  fixAt?: string | null;
  height?: number;
}

/**
 * Customer live-tracking map (E3/E7). Loads once; only the chef marker moves when a new fix arrives.
 * Google Maps SDK (react-native-maps) when the build has GOOGLE_MAPS_API_KEY; otherwise the same WebView map as the
 * rest of the app, so a build without a key never crashes on the native SDK's missing-key check.
 */
export function LiveMap(props: LiveMapProps) {
  return APP_CONFIG.mapsEnabled && APP_CONFIG.googleMapsConfigured ? <GoogleLiveMap {...props} /> : <WebLiveMap {...props} />;
}

function tweenMs(prevAt: string | null, at: string | null | undefined, stale?: boolean) {
  if (stale || !prevAt || !at) return 0;
  const gap = Date.parse(at) - Date.parse(prevAt);
  return gap > 0 && gap <= MAX_TWEEN_MS ? Math.min(gap, 4_500) : 0;
}

function GoogleLiveMap({ destination, chef, stale, fixAt, height = 320 }: LiveMapProps) {
  const mapRef = useRef<MapView>(null);
  const fitted = useRef(false);
  const prevAt = useRef<string | null>(null);
  const coord = useRef(new AnimatedRegion({ latitude: chef?.lat ?? destination.lat, longitude: chef?.lng ?? destination.lng,
                                            latitudeDelta: 0, longitudeDelta: 0 })).current;

  useEffect(() => {
    if (!chef) return;
    const ms = tweenMs(prevAt.current, fixAt, stale);
    prevAt.current = fixAt ?? null;
    if (ms) {
      coord.timing({ latitude: chef.lat, longitude: chef.lng, latitudeDelta: 0, longitudeDelta: 0, duration: ms,
                     useNativeDriver: false, toValue: 0 } as any).start();
    } else {
      coord.setValue({ latitude: chef.lat, longitude: chef.lng, latitudeDelta: 0, longitudeDelta: 0 });
    }
    if (!fitted.current) {
      fitted.current = true;
      mapRef.current?.fitToCoordinates([{ latitude: chef.lat, longitude: chef.lng }, { latitude: destination.lat, longitude: destination.lng }],
        { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
    }
  }, [chef?.lat, chef?.lng, fixAt, stale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.box, { height }]}>
      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFill} toolbarEnabled={false}
               initialRegion={{ latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}>
        <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title="Your home" pinColor={colors.primary} />
        {chef && (
          <Polyline coordinates={[{ latitude: chef.lat, longitude: chef.lng }, { latitude: destination.lat, longitude: destination.lng }]}
                    strokeColor={colors.textMuted} strokeWidth={2} lineDashPattern={[6, 6]} />
        )}
        {chef && (
          <ChefMarker coordinate={coord} title={stale ? 'Last known position' : 'Your chef'}
                          pinColor={stale ? colors.textMuted : colors.accent} opacity={stale ? 0.5 : 1} tracksViewChanges={false} />
        )}
      </MapView>
    </View>
  );
}

function WebLiveMap({ destination, chef, stale, fixAt, height = 320 }: LiveMapProps) {
  const ref = useRef<any>(null);
  const ready = useRef(false);
  const pending = useRef<string | null>(null);
  const prevAt = useRef<string | null>(null);

  // Built once per destination: later fixes are injected, so the map never reloads or flickers.
  const html = useMemo(() => `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#FAF4E8}
.home{width:28px;height:28px;background:${colors.primary};border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.35)}
.chef{width:22px;height:22px;background:${colors.accent};border:3px solid #fff;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.4);transition:opacity .3s}
.chef.stale{background:#9A9A9A;opacity:.55}
.leaflet-control-attribution{display:none!important}</style></head><body><div id="map"></div><script>
var dest=[${destination.lat},${destination.lng}];
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView(dest,15);
L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{maxZoom:20,subdomains:['mt0','mt1','mt2','mt3']}).addTo(map);
L.marker(dest,{icon:L.divIcon({className:'',html:'<div class="home"></div>',iconSize:[28,28],iconAnchor:[14,28]})}).addTo(map);
var chef=null,line=null,anim=null,fitted=false;
window.setChef=function(lat,lng,stale,ms){
  var to=[lat,lng];
  if(!chef){chef=L.marker(to,{icon:L.divIcon({className:'',html:'<div class="chef"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);
    line=L.polyline([to,dest],{color:'#8A8A8A',weight:2,dashArray:'6 6'}).addTo(map);}
  var el=chef.getElement()&&chef.getElement().firstChild; if(el){el.className=stale?'chef stale':'chef';}
  if(anim){cancelAnimationFrame(anim);anim=null;}
  var from=chef.getLatLng(), t0=null;
  function step(ts){ if(t0===null)t0=ts; var k=Math.min(1,(ts-t0)/ms);
    var p=[from.lat+(lat-from.lat)*k, from.lng+(lng-from.lng)*k]; chef.setLatLng(p); line.setLatLngs([p,dest]);
    if(k<1){anim=requestAnimationFrame(step);} }
  if(ms>0){anim=requestAnimationFrame(step);}else{chef.setLatLng(to);line.setLatLngs([to,dest]);}
  if(!fitted){fitted=true;map.fitBounds([to,dest],{padding:[40,40]});}
};
</script></body></html>`, [destination.lat, destination.lng]);

  useEffect(() => {
    if (!chef) return;
    const ms = tweenMs(prevAt.current, fixAt, stale);
    prevAt.current = fixAt ?? null;
    const js = `window.setChef && window.setChef(${Number(chef.lat)},${Number(chef.lng)},${stale ? 'true' : 'false'},${ms}); true;`;
    if (ready.current) ref.current?.injectJavaScript(js);
    else pending.current = js;
  }, [chef?.lat, chef?.lng, fixAt, stale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.box, { height }]} accessibilityLabel="Map showing your chef and your home">
      <WebView ref={ref} source={{ html }} style={{ flex: 1, backgroundColor: 'transparent' }} javaScriptEnabled scrollEnabled={false}
               onLoadEnd={() => {
                 ready.current = true;
                 if (pending.current) ref.current?.injectJavaScript(pending.current);
                 pending.current = null;
               }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#FAF4E8' },
});
