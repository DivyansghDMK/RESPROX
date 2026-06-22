# ResproX CPAP Dashboard - Codebase & Design Reference

This document serves as an end-to-end developer reference explaining the current architecture, components, routing, responsive design, and CSS style tokens implemented in the **resproX** CPAP dashboard.

---

## 1. Project Architecture & Stack
- **Framework**: Vite + React (v18)
- **Routing**: React Router DOM (v7)
- **Styling**: Vanilla CSS (`src/styles.css`)
- **State Management**: React Context API (`src/context/TherapyContext.jsx` tracking state values: `mode`, `pressure`, `minPressure`, `maxPressure`, `aflex`, `ramp`, `showToast`, `saveState`).

---

## 2. Layouts, Routing, & Standalone Auth Shell
The routing in [App.jsx](file:///Users/deckmount/Desktop/cpap/src/App.jsx) detects if the user is on an authentication page or if the route falls back to the default initial load page.

- **Initial Load Redirect**: Loading the root URL (`/`) or typing an invalid URL redirects automatically to `/login`.
- **Standalone Auth Shell**: If `location.pathname === '/login'` or `'/forgot-password'` or `'/'`, the application renders inside a `.auth-shell` container, omitting dashboard elements like the Sidebar, Header, and Mobile Navigation.
- **Main Layout Shell**: Authenticated pages render inside `.app-shell`, which displays the desktop `Sidebar`, main `content` canvas, mobile `Header`, and mobile `BottomNavbar`.

```jsx
// App.jsx layout routing logic
const location = useLocation();
const isAuthPage = location.pathname === '/login' || location.pathname === '/forgot-password' || location.pathname === '/';

if (isAuthPage) {
  return (
    <div className="auth-shell">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toast />
    </div>
  );
}
```

---

## 3. UI Components & Layout Schemes

### A. Navigation Schemes (Responsive)
- **Desktop (width >= 768px)**: Renders the [Sidebar.jsx](file:///Users/deckmount/Desktop/cpap/src/components/Sidebar.jsx) with navigation pills and brand marks. Hides the mobile header and mobile bottom navigation.
- **Mobile (width < 768px)**:
  - **Header**: Hides the hamburger menu and displays the profile avatar on the left, **resproX** (black text logo + bright teal **X**) in the center, and a notification bell with a cyan dot badge on the right.
  - **Bottom Navbar**: Displays a fixed navigation bar with `Dashboard`, `Device` (phone icon), `Therapy` (pulse icon), and `Reports` (clipboard icon) navigation buttons. The active item displays a cyan/blue gradient rounded square background under its icon and highlights the text in teal.

### B. Device Connection Card (Mobile Viewport)
Renders a light-blue container featuring:
- A circular badge with a Bluetooth icon on the left.
- "CPAP VT30 D" text and "• Connected" in green.
- A rounded "Device info" button on the right containing a small info icon.

### C. "Today at a glance" Statistics (Mobile Viewport)
A white card with a clean shadow containing:
- Card header with a calendar icon and the date `May 26, 2026`.
- A horizontally scrollable flex-row containing 4 metric cards:
  1. **Usage**: "7h 32m", "of 8h goal", and a circular progress ring showing `94%`.
  2. **Mask Seal**: "24 L/min" with a rounded badge displaying "Good" (green text on light-green background).
  3. **Pressure**: "11.8 cm H₂O" with a green subtext displaying "95th Percentile".
  4. **AHI**: "2.1 events/hr" with a rounded "Good" badge.

### D. Therapy Mode Selector (CPAP vs. AUTO CPAP)
Features tab selectors:
- **CPAP**: Wind/breeze SVG icon (`BreezeIcon`).
- **AUTO CPAP**: Upward line graph SVG icon (`GrowthIcon`).
- **Active State**: The active tab displays a vibrant gradient (blue-to-cyan) background with white text and icon. Inactive tabs display white backgrounds, thin grey borders, and dark grey text.

### E. Settings Panels (CPAP vs. AUTO CPAP)
Renders configuration settings inside the active mode wrapper in both [Dashboard.jsx](file:///Users/deckmount/Desktop/cpap/src/pages/Dashboard.jsx) and [Therapy.jsx](file:///Users/deckmount/Desktop/cpap/src/pages/Therapy.jsx):
- **Pressure Sliders**: Features large bold value readouts (e.g. `12.0 cmH₂O`). The custom range slider input displays a blue track from `4` to the current value, a bright teal track from the value to `30`, and a white circle thumb.
- **Ramp Time Steppers**: A stepper box displaying `-` and `+` circular buttons, a centered value (e.g. `12.0 cmH₂O`), and a range indicator showing `Range: 4 - 30 H₂O` (bound to `ramp` state).
- **EPR (A-Flex) Selector**: A segmented pill selection layout (Off, 1, 2, 3) where the active element lights up with the blue-to-cyan gradient background and white text.
- **Maintenance Row**: Positioned at the bottom of the card, it displays "Next Mask Change" (with green subtext `28 days left`) and "File Life" (with green subtext `56% Remaining` and a right chevron arrow) side-by-side, divided by a vertical line.

---

## 4. Admin Auth Pages (Standalone Layouts)

### A. Admin Login Page (`/login`)
- **Credentials**: Hardcoded credentials check for Username `admin` and Password `admin123`.
- **Form UI**:
  - Glassmorphic container card with inputs containing left-aligned icons (Username icon and Lock icon).
  - Password view toggle using premium SVG `Eye` / `EyeOff` icons.
  - "Keep me signed in" custom checkbox.
  - Submit action button displaying a circular rotating loading spinner when loading.
  - Redirection link to the forgot password page.

### B. Forgot Password Recovery Page (`/forgot-password`)
- Uses the same glassmorphism design with ambient background glow blobs.
- Submitting the form displays a clean success panel indicating a recovery link has been sent to the email, with a return button back to `/login`.

---

## 5. CSS Classes & Design Tokens (`styles.css`)

Key custom CSS rules added for the mobile layout and auth pages:

- **Ambient Background Glow**:
  ```css
  .auth-background-glow {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: 0;
    pointer-events: none;
  }
  .glow-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(140px);
    opacity: 0.12;
    animation: float-glow 10s infinite alternate ease-in-out;
  }
  .glow-blob-1 {
    background: #0d7de6; /* Blue blob top-left */
  }
  .glow-blob-2 {
    background: #27c6c7; /* Teal blob bottom-right */
  }
  ```

- **Bottom Navigation Active Icon**:
  ```css
  .bottom-nav-item.active .bottom-nav-icon-container {
    background: linear-gradient(135deg, #0d7de6 0%, #30d5c9 100%);
    color: white;
    box-shadow: 0 4px 10px rgba(13, 125, 230, 0.2);
  }
  ```

- **Metrics Horizontal Row (With hidden scrollbars)**:
  ```css
  .glance-metrics-row {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    scrollbar-width: none;
  }
  .glance-metrics-row::-webkit-scrollbar {
    display: none;
  }
  ```

- **Custom Range Slider Input**:
  ```css
  .custom-range-slider {
    appearance: none;
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: linear-gradient(to right, #0076e4 0%, #30c8c9 var(--progress), #cbd5e1 var(--progress), #cbd5e1 100%);
  }
  .custom-range-slider::-webkit-slider-thumb {
    appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #ffffff;
    border: 5px solid #ffffff;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  }
  ```

- **Spinning Loader Keyframes**:
  ```css
  .spinner-dot {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spinner-rotate 0.8s linear infinite;
  }
  @keyframes spinner-rotate {
    to { transform: rotate(360deg); }
  }
  ```
