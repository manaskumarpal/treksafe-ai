# TrekSafe AI

**AI-Powered Smart Trekking Safety System — software prototype**

TrekSafe AI is a machine-learning trekking-safety assistant prototype. It explores how smart glasses, environmental sensors, and a safety classifier could help trekkers identify potentially risky conditions. The current app uses generated sensor readings and a synthetic training dataset to classify scenarios as **SAFE**, **CAUTION**, or **DANGER**.

> TrekSafe AI is a Machine Learning based trekking safety assistant that explores how smart glasses, environmental sensors and intelligent safety prediction can help trekkers identify potentially dangerous situations. This software prototype simulates sensor inputs and uses machine learning to classify trekking conditions into Safe, Caution and Danger. A future hardware version could integrate thermal/infrared sensing, cameras, proximity sensors and vibration feedback through smart glasses.

## Prototype features

- Responsive dashboard for current demo safety status and simulated trail conditions
- Scenario controls for wildlife, clear trail, obstacle, steep terrain, and low visibility
- In-browser Random Forest prediction from nine generated sensor features
- Simulated alert and vibration feedback
- Simulated smart-glasses connection and sensor status
- Demo trail visualization and simulated coordinates
- Three illustrative demo trips plus trip history saved in the current browser's local storage
- Safety analytics and a planned hardware architecture overview

## Run locally

From the project workspace:

```sh
pnpm --filter @workspace/treksafe-ai run dev
```

The app is part of a pnpm workspace. Install dependencies from the workspace root with `pnpm install` if needed.

## ML proof of concept

The prediction module generates a deterministic dataset of 720 synthetic examples from plausible relationships among object distance and category, terrain and slope, visibility, temperature, animal proximity, obstacle density, and environmental conditions. A small Random Forest of 13 bootstrapped decision trees is trained in the browser from this dataset and predicts the class by majority vote. The displayed confidence is the share of trees voting for the selected class.

This is a transparent demonstration of a classification workflow, not a validated or field-tested model. The data is synthetic, the risk rules are illustrative, and the confidence score is not a calibrated probability. Do not use the output for real trek planning or emergency decisions.

## Technical honesty and future hardware

This software proof of concept does **not** contain or access infrared/thermal imaging, smart-glasses hardware, wildlife sensors, or real-time animal detection. The app's device status, sensor readings, detections, location, trail, alerts, and vibration feedback are simulations labelled as demo data. A phone camera is not represented as a thermal sensor.

Planned architecture:

```text
Smart glasses
  → camera + future thermal/infrared + environmental/proximity/motion sensors
  → edge processing / microcontroller
  → wireless communication
  → mobile application
  → machine-learning safety analysis
  → user alert
  → future vibration feedback through glasses
```

Real hardware integration would require suitable sensors, communications, on-device or server-side processing, field validation, and safety testing. The current prototype provides none of those guarantees.
