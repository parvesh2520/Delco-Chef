import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as NativeWebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, radius } from '../theme';
import type { LatLng } from '../types';

const WebView = NativeWebView as unknown as React.ComponentType<any>;

export interface RealMapPickerRef {
  flyTo: (lat: number, lng: number) => void;
}

interface RealMapPickerProps {
  initialLocation: LatLng;
  onLocationChange: (location: LatLng) => void;
  height?: number;
}

/**
 * Real interactive Google Map with a draggable location pin.
 * Works seamlessly across Android Expo Go, physical devices, iOS and Emulators.
 */
export const RealMapPicker = forwardRef<RealMapPickerRef, RealMapPickerProps>(
  ({ initialLocation, onLocationChange, height = 380 }, ref) => {
    const webViewRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      flyTo: (lat: number, lng: number) => {
        const js = `
          if (window.updatePosition) {
            window.updatePosition(${lat}, ${lng});
          }
          true;
        `;
        webViewRef.current?.injectJavaScript(js);
      },
    }));

    const htmlContent = useMemo(() => {
      const lat = initialLocation.lat || 12.9716;
      const lng = initialLocation.lng || 77.5946;

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #FAF4E8;
      overflow: hidden;
    }
    .pin-container {
      position: relative;
      width: 40px;
      height: 48px;
    }
    .pin-marker {
      position: absolute;
      top: 0;
      left: 4px;
      width: 32px;
      height: 32px;
      background: ${colors.accent};
      border: 3px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 4px 10px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pin-dot {
      width: 10px;
      height: 10px;
      background: #FFFFFF;
      border-radius: 50%;
    }
    .pin-shadow {
      position: absolute;
      bottom: 2px;
      left: 11px;
      width: 18px;
      height: 6px;
      background: rgba(0, 0, 0, 0.28);
      border-radius: 50%;
      filter: blur(1.5px);
    }
    .leaflet-control-attribution {
      display: none !important;
    }
    .leaflet-bar a {
      background-color: #FFFFFF !important;
      color: ${colors.primary} !important;
      border-color: #E7DCD2 !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([${lat}, ${lng}], 16);

    // Google Maps Roadmap tile layer
    var googleLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(map);

    // Fallback to OpenStreetMap if Google subdomains fail
    googleLayer.on('tileerror', function() {
      if (!window.osmFallbackAdded) {
        window.osmFallbackAdded = true;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      }
    });

    var pinIcon = L.divIcon({
      className: '',
      html: '<div class="pin-container"><div class="pin-shadow"></div><div class="pin-marker"><div class="pin-dot"></div></div></div>',
      iconSize: [40, 48],
      iconAnchor: [20, 44]
    });

    var marker = L.marker([${lat}, ${lng}], {
      draggable: true,
      icon: pinIcon
    }).addTo(map);

    function emitLocation(latVal, lngVal) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PIN_MOVED',
          lat: Number(latVal),
          lng: Number(lngVal)
        }));
      }
    }

    marker.on('dragend', function() {
      var pos = marker.getLatLng();
      emitLocation(pos.lat, pos.lng);
    });

    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      emitLocation(e.latlng.lat, e.latlng.lng);
    });

    window.updatePosition = function(newLat, newLng) {
      marker.setLatLng([newLat, newLng]);
      map.flyTo([newLat, newLng], 17, { animate: true, duration: 0.8 });
    };
  </script>
</body>
</html>
      `;
    }, [initialLocation.lat, initialLocation.lng]);

    return (
      <View style={[styles.container, { height }]}>
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          onMessage={(event: WebViewMessageEvent) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'PIN_MOVED') {
                onLocationChange({ lat: Number(data.lat), lng: Number(data.lng) });
              }
            } catch {
              // Ignore invalid messages
            }
          }}
        />
      </View>
    );
  }
);

RealMapPicker.displayName = 'RealMapPicker';

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAF4E8',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
