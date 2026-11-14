import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Kitchen line illustrations for empty, success and waiting screens. One style everywhere: plum ink outlines,
 * cream/white fills, a single warm-orange accent and a soft ground shadow.
 */
export type Art = 'plate' | 'cloche' | 'pot' | 'receipt' | 'hat' | 'map' | 'calendar' | 'plug';

const INK = colors.primary;
const W = 2;
const line = { stroke: INK, strokeWidth: W, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const soft = { ...line, strokeOpacity: 0.3 };

function Ground({ rx = 48 }: { rx?: number }) {
  return <Ellipse cx={80} cy={106} rx={rx} ry={5} fill={INK} opacity={0.07} />;
}

function Steam({ x, y, h = 22 }: { x: number; y: number; h?: number }) {
  return <Path d={`M${x} ${y} c-5 -${h / 4} 5 -${h / 2} 0 -${(h * 3) / 4} c-3 -${h / 8} -2 -${h / 5} 0 -${h / 4}`} fill="none" {...soft} />;
}

const SCENES: Record<Art, React.ReactNode> = {
  plate: (
    <G>
      <Ground rx={52} />
      <Circle cx={80} cy={62} r={38} fill={colors.card} {...line} />
      <Circle cx={80} cy={62} r={26} fill={colors.backgroundSecondary} {...soft} />
      <Path d="M52 44 A34 34 0 0 1 70 30" fill="none" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" />
      {/* fork */}
      <Path d="M24 26 v14 M29 26 v14 M34 26 v14 M24 40 q5 6 10 0 M29 43 v55" fill="none" {...line} />
      {/* knife */}
      <Path d="M132 98 V28 c8 6 10 22 6 36 h-6" fill={colors.card} {...line} />
    </G>
  ),
  cloche: (
    <G>
      <Ground rx={58} />
      <Steam x={30} y={60} h={20} />
      <Steam x={132} y={58} h={24} />
      <Path d="M34 92 A46 46 0 0 1 126 92 Z" fill={colors.accentLight} {...line} />
      <Path d="M50 78 A32 32 0 0 1 68 58" fill="none" stroke={colors.card} strokeWidth={4} strokeLinecap="round" />
      <Rect x={74} y={38} width={12} height={9} rx={4} fill={colors.accent} {...line} />
      <Rect x={22} y={92} width={116} height={9} rx={4.5} fill={colors.card} {...line} />
    </G>
  ),
  pot: (
    <G>
      <Ground rx={50} />
      <Steam x={66} y={40} />
      <Steam x={80} y={36} h={26} />
      <Steam x={94} y={40} />
      <Path d="M44 58 h72 v30 a10 10 0 0 1 -10 10 h-52 a10 10 0 0 1 -10 -10 Z" fill={colors.card} {...line} />
      <Rect x={44} y={70} width={72} height={7} fill={colors.accentLight} />
      <Path d="M44 70 h72 M44 77 h72" {...soft} />
      <Path d="M44 64 h-7 a5 5 0 0 0 0 10 h7 M116 64 h7 a5 5 0 0 1 0 10 h-7" fill="none" {...line} />
      <Rect x={38} y={50} width={84} height={8} rx={4} fill={colors.accent} {...line} />
      <Rect x={73} y={43} width={14} height={7} rx={3} fill={INK} />
    </G>
  ),
  receipt: (
    <G>
      <Ground rx={44} />
      <Path d="M50 16 h60 v80 l-7.5 -5 -7.5 5 -7.5 -5 -7.5 5 -7.5 -5 -7.5 5 -7.5 -5 -7.5 5 Z" fill={colors.card} {...line} />
      <Path d="M60 30 h26 M60 40 h40 M60 50 h34" {...soft} />
      <Path d="M60 64 h18" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <Path d="M60 74 h28" {...soft} />
      <Circle cx={112} cy={82} r={15} fill={colors.accent} {...line} />
      <Path d="M105 82 l5 5 l9 -10" fill="none" stroke={colors.card} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  ),
  hat: (
    <G>
      <Ground rx={40} />
      <Circle cx={60} cy={50} r={17} fill={colors.card} {...line} />
      <Circle cx={100} cy={50} r={17} fill={colors.card} {...line} />
      <Circle cx={80} cy={40} r={22} fill={colors.card} {...line} />
      <Path d="M56 58 h48 v34 a4 4 0 0 1 -4 4 h-40 a4 4 0 0 1 -4 -4 Z" fill={colors.card} {...line} />
      <Rect x={57} y={80} width={46} height={9} fill={colors.accent} />
      <Path d="M56 80 h48 M56 89 h48" {...line} />
      <Path d="M68 62 v14 M80 62 v14 M92 62 v14" {...soft} />
    </G>
  ),
  map: (
    <G>
      <Ground rx={54} />
      <Path d="M28 40 L62 30 L98 40 L132 30 V90 L98 100 L62 90 L28 100 Z" fill={colors.card} {...line} />
      <Path d="M62 30 L98 40 V100 L62 90 Z" fill={colors.backgroundSecondary} {...line} />
      <Path d="M40 84 C54 70 64 86 80 72 S102 58 104 52" fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 6" />
      <Path d="M104 22 a12 12 0 0 1 12 12 c0 9 -12 20 -12 20 s-12 -11 -12 -20 a12 12 0 0 1 12 -12 Z" fill={INK} />
      <Circle cx={104} cy={34} r={4.5} fill={colors.accent} />
      <Circle cx={40} cy={84} r={4} fill={colors.card} {...line} />
    </G>
  ),
  calendar: (
    <G>
      <Ground rx={46} />
      <Rect x={38} y={28} width={84} height={70} rx={10} fill={colors.card} {...line} />
      <Path d="M38 48 V38 a10 10 0 0 1 10 -10 h64 a10 10 0 0 1 10 10 v10 Z" fill={colors.accent} {...line} />
      <Path d="M60 20 v14 M100 20 v14" {...line} />
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
        <Circle key={`${r}${c}`} cx={54 + c * 17} cy={62 + r * 12} r={2.5} fill={INK} opacity={r === 1 && c === 2 ? 0 : 0.22} />
      )))}
      <Circle cx={88} cy={74} r={7} fill="none" stroke={colors.accent} strokeWidth={2.5} />
      <Circle cx={88} cy={74} r={2.5} fill={INK} />
    </G>
  ),
  plug: (
    <G>
      <Ground rx={60} />
      <Path d="M14 74 C34 74 38 58 58 58" fill="none" {...line} />
      <Rect x={58} y={48} width={26} height={20} rx={6} fill={colors.card} {...line} />
      <Path d="M84 53 h9 M84 63 h9" {...line} />
      <Path d="M100 58 h3 M107 58 h3" {...soft} />
      <Rect x={114} y={40} width={32} height={36} rx={9} fill={colors.accentLight} {...line} />
      <Line x1={125} y1={52} x2={125} y2={58} {...line} />
      <Line x1={135} y1={52} x2={135} y2={58} {...line} />
      <Path d="M126 66 h8" {...soft} />
    </G>
  ),
};

export function Illustration({ art, size = 160 }: { art: Art; size?: number }) {
  return (
    <Svg width={size} height={(size * 120) / 160} viewBox="0 0 160 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SCENES[art]}
    </Svg>
  );
}

/** Picks a scene for screens that only pass an icon, so existing empty states get artwork without changes. */
export function artForIcon(icon?: string): Art | undefined {
  if (!icon) return undefined;
  if (icon.startsWith('calendar')) return 'calendar';
  if (/^(card|wallet|receipt|document-text|cash)/.test(icon)) return 'receipt';
  if (/^(location|map|navigate)/.test(icon)) return 'map';
  if (/^(albums|cafe|restaurant|fast-food|file-tray)/.test(icon)) return 'plate';
  if (/^(people|person)/.test(icon)) return 'hat';
  if (icon.startsWith('cloud-offline')) return 'plug';
  return undefined;
}
