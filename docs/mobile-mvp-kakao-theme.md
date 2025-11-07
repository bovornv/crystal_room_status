# Rai AI Mobile App MVP – Kakao‑Inspired Theme (Design Spec)

**Purpose**: Give Cursor AI a single source of truth to style the Rai AI **mobile MVP** like a calm, medical‑grade product (Kakao Healthcare vibes) while keeping an agricultural soul (teal/green accent). **Thai first**, **large type**, **offline‑friendly**.

---

## 1) Design Goals
- **Thai default** (EN optional); copy is short, simple, farmer‑friendly.
- **Large, legible typography** (comfortable at arm’s length on budget Android).
- **Calm, clinical feel**: airy spacing, soft gradients, rounded cards, subtle shadows.
- **Agricultural accent**: teal/green as primary; photos of leaves/fields sparingly.
- **Touch-first**: big hit targets (min 48×48dp), one hand use.
- **Low-noise** UI that works offline; optimistic updates + clear sync states.

---

## 2) Typography
- **Primary font**: *Noto Sans Thai* (Android & iOS) bundled in assets.
- **Sizes (dp)**  
  - Display: 28 / 24 (page titles)  
  - Heading: 20 (card titles)  
  - Body: **18** (default app body)  
  - Caption/Meta: 14 (timestamps, sources)  
- **Line-height**: 1.35–1.45 for Thai readability.  
- **Weights**: Regular / Medium / Bold only.  
- **Rules**: Never truncate critical actions; wrap text; avoid ALL CAPS in Thai.

---

## 3) Color & Elevation
- **Primary**: `#15803D` (Green 700)  
- **Primary Light (teal accent)**: `#0F766E`  
- **Success**: `#16A34A`  
- **Warning**: `#F59E0B`  
- **Danger**: `#DC2626`  
- **Text**: `#0B1320` / Muted `#63738A`  
- **Surface**: `#FFFFFF` ; **Background**: `#F6F8FA`  
- **Spray Window badges**  
  - Good: `#E7F8EE` / text `#15803D`  
  - Caution: `#FFF6DB` / text `#B45309`  
  - Don’t spray: `#FDECEC` / text `#B91C1C`  
- **Shadow**: very soft (Android elevation 2–4).  
- **Gradients (optional)**: top subtle `#F8FBF9 → #FFFFFF`.

---

## 4) Spacing & Layout
- **Grid**: 8dp spacing system; page padding 16–20dp; card radius 16–20dp.  
- **Card anatomy**: Icon (24–28dp) → Title (20) → Body (18) → Meta (14).  
- **Top bar**: App name **“ไร่ AI / Rai AI”**, language chip `TH | EN`.  
- **Bottom nav** (5 tabs): Home, Scan, Fields, Weather, Settings.  
- **Empty states**: friendly emoji + 1 line + CTA button.

---

## 5) Components (ready-to-build)
- **Badge / Chip**: rounded‑full; 14–16dp text; used for Spray Window status + confidence (สูง/กลาง/ต่ำ).  
- **Button**: large (min 48dp height), primary filled green; secondary outline.  
- **Card**: shadow 2, radius 20, white surface; internal spacing 16dp.  
- **Input**: large label, helper text under; numeric keypad for area (ไร่).  
- **Tabs**: segmented (ข้าว | ทุเรียน) with bold active state.  
- **Toast**: bottom, short Thai messages (< 60 chars).  
- **Skeleton**: rounded lines for loading (weather/scan).

---

## 6) Motion
- **Open/close**: 120–180ms ease‑out.  
- **Micro‑feedback**: press ripple 80ms; success check 200ms.  
- **Avoid heavy parallax**; prefer subtle fades/slide‑up.

---

## 7) Accessibility
- Contrast ≥ 4.5:1 for body text; ≥ 3:1 for large headings.  
- Touch targets ≥ 48dp.  
- Support system font scale up to 120%.  
- Icons **with labels** (no icon‑only nav).

---

## 8) Internationalization (i18n)
- **Default**: Thai.  
- **Toggle**: Settings page and header chip `TH | EN`.  
- Keys grouped by page: `home.*`, `scan.*`, `fields.*`, `weather.*`, `settings.*`.  
- Dates: Thai locale format; fallback to `DD MMM YY`.  
- Units: `ไร่` (rai) for area; `บาท/ตัน` for rice price; `บาท/กก` for durian.

---

## 9) Offline & States
- Show **offline banner**: “โหมดออฟไลน์ – กำลังใช้ข้อมูลล่าสุดที่บันทึกไว้”.  
- Sync pill: “ปรับข้อมูลล่าสุดเมื่อ 05:40”.  
- Cache: weather/prices/fields ≥ 3 days; scan result limited to 1/day.  
- Actions are **optimistic**; queue writes and retry when online.

---

## 10) Page Blueprints
### Home
- Header: date (left) / location (right).  
- Segmented tabs: ข้าว | ทุเรียน.  
- Card 1: **Spray Window** (badge + short reason).  
- Card 2: **Today’s Price** (big number + small source).  
- Footer meta: last updated time.

### Scan
- Instruction card (TH default) with 3 simple bullets.  
- **One capture area** (camera + upload). Auto‑analyze on first photo.  
- Result card: disease/deficiency, confidence chip, **3 steps**, PPE icons, disclaimer.  
- Demo note + CTA “ดาวน์โหลดแอป” if using mock.

### Fields
- Limit to **1 field** in MVP.  
- Summary card: name, location, area (ไร่), crop, stage/progress bar.  
- Actions: Edit info, Pick map point, Set as main.  
- Weather mini‑strip + Spray Window chip.

### Weather
- 7‑day forecast list; today expanded (temp, wind, humidity).  
- Location input (ตำบล, จังหวัด) + “ใช้ตำแหน่งของฉัน”.  
- Spray Window row for the next 12h.

### Settings
- Language switch `TH | EN`.  
- Offline status; clear cache; version; contact support.

---

## 11) Implementation Notes for Cursor (Expo + RN)
- Install: `expo-font`, `expo-linear-gradient`, `@react-navigation/bottom-tabs`, `react-native-paper` or Tailwind RN, `i18next`, `expo-localization`.  
- Load fonts at boot and **hide splash** when ready.  
- Theme module `theme.ts` with colors, spacing, radius, typography scale.  
- Components folder: `Badge.tsx`, `Card.tsx`, `PriceCard.tsx`, `SprayWindow.tsx`, `InstructionCard.tsx`.  
- Keep Thai strings in `locales/th.json`; English in `locales/en.json`.

---

## 12) Sample Theme Object (TypeScript)
```ts
export const theme = {
  colors: {
    bg: "#F6F8FA",
    surface: "#FFFFFF",
    text: "#0B1320",
    muted: "#63738A",
    primary: "#15803D",
    primaryAlt: "#0F766E",
    success: "#16A34A",
    warn: "#F59E0B",
    danger: "#DC2626",
    badge: {
      goodBg: "#E7F8EE", goodText: "#15803D",
      cautionBg: "#FFF6DB", cautionText: "#B45309",
      dontBg: "#FDECEC", dontText: "#B91C1C",
    }
  },
  radius: 20,
  spacing: (n:number)=> n*8,
  type: { display: 28, title: 20, body: 18, caption: 14 }
};
```

---

## 13) Definition of Done
- Thai default UI matches scale/colors above.  
- Cards are rounded with soft shadows; airy spacing.  
- Spray Window & Price cards match badge tokens.  
- Camera+upload combined; analysis runs after first photo.  
- Works offline with clear banners; sync when online.
