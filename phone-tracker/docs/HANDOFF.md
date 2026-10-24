# Phone Tracker: handoff to Claude Code

**For Apple:** this one file holds the whole SBUHacks 2026 Phone Tracker project as of Oct 23, 2026: the summary, the decisions, the shopping list, the build steps, the steam ideas and both code files. Claude Code reads it once and builds a project folder from it. After that, the folder's `CLAUDE.md` loads automatically at the start of every Claude Code session you start in that folder.

**For Claude Code:** follow the setup steps below exactly. Everything after them is file content to write.

---

## Setup steps for Claude Code

1. **Create the folder.** Make a folder named `phone-tracker` in the current working directory (Apple should have started you in `~/Projects`). If `phone-tracker` already exists and isn't empty, stop and ask Apple what to do, using the multiple-choice question tool.

2. **Write every file in the "Files" section below,** at the path shown in its heading, relative to `phone-tracker/`. Each file's content sits between a line of five tildes (`~~~~~`, optionally followed by a language name) and the next line of five tildes. Write the content exactly as given; don't summarize, reformat or "fix" the code. Create folders as needed. The finished layout:

   ```
   phone-tracker/
   ├── CLAUDE.md
   ├── .gitignore
   ├── app/
   │   └── PhoneTrackerApp.swift
   ├── firmware/
   │   └── PhoneTracker_ESP32/
   │       └── PhoneTracker_ESP32.ino
   ├── print/
   │   └── README.md
   └── docs/
       ├── BUILD_STEPS.md
       ├── DEMO_AND_PITCH.md
       ├── HANDOFF.md        (this file, moved here in step 3)
       ├── SESSION_LOG.md
       ├── SHOPPING_LIST.md
       ├── STEAM.md
       └── manuals/          (empty unless Apple adds the PDFs in step 4)
   ```

3. **Move this handoff file** to `phone-tracker/docs/HANDOFF.md` so the original stays with the project.

4. **Ask about the PDFs.** Ask Apple, with the multiple-choice question tool, whether they have `Phone_Tracker_Build_Manual.pdf` (from the `Phone_Tracker_Project.zip` made in claude.ai) to copy into `docs/manuals/`. If yes, ask for its location and copy it. If no, leave the folder empty; `docs/BUILD_STEPS.md` covers the same steps.

5. **Check the code files.** Confirm `app/PhoneTrackerApp.swift` and `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino` end with the closing braces shown here and weren't cut short. Don't try to compile them now.

6. **Start version history.** If `git` is available, run `git init` in `phone-tracker/`, then ask Apple before making the first commit ("Project setup from claude.ai handoff"). If `git` isn't installed, tell Apple and skip this step; don't install anything.

7. **Report back** with:
   - the folder tree you created;
   - a reminder to start every future session from the project folder, so `CLAUDE.md` loads: `cd ~/Projects/phone-tracker && claude`;
   - the first open question from `CLAUDE.md`, asked with the multiple-choice question tool: which iPhone model goes on the rig, and whether it stays in a case.

---

## Files

### `CLAUDE.md`

~~~~~markdown
# Phone Tracker (SBUHacks 2026)

A motorized stand that holds an iPhone and keeps one chosen person in the shot, even when they turn their back or hide under a blanket or box. Built by Apple and partner River for SBUHacks 2026 at Stony Brook University. Planned in claude.ai from Oct 16 to Oct 23, 2026; this folder is where every Claude Code session continues it.

## How to work with Apple

- Apple mainly writes Luau (Roblox) and is newer to C++ and Swift. Explain every code change in plain words: what changed, why, and how to test it.
- Give concrete, numbered steps Apple can follow exactly. Recommend one option instead of listing open-ended choices.
- When you need to ask something, use the multiple-choice question tool, not a plain-text question.
- When unsure what Apple means, ask before building or redesigning.
- Ask before installing anything, buying anything, or committing to git.
- For hardware, say what's verified and what's an estimate, and name the test that would confirm it.

## End of every session

1. Add a dated entry to `docs/SESSION_LOG.md`: what changed, what was decided, what's next.
2. Update the Status, Open questions and Next steps sections below.
3. When a decision changes, move it into Decisions or Ruled out, and update every file it touches.

## Event

- SBUHacks 2026, Stony Brook University. Theme: "Steel and Steam". The project is deliberately not Roblox-related, because judges may not know Roblox.
- Length unclear: Stony Brook's CS page says 24 hours and sbuhacks.org says 48. The plan assumes 36. Date not confirmed.
- Most hackathons allow hardware bought and printed beforehand but want code written at the event. Check the rules; if so, treat the code here as a reference.

## Decisions (locked)

1. River's setup: the iPhone runs the AI and the app; an Adafruit ESP32 Feather V2 moves the motors and talks to the phone over Bluetooth. No laptop in the loop.
2. The iPhone's rear camera, not the front one.
3. Lynxmotion Pan and Tilt Kit (BPT-KT) with its two Hitec HS-422 servos, as sold.
4. LD2410C radar (the C version) confirms someone is still under a cover. It's wired to the ESP32 and reported to the phone.
5. Print the phone holder and base box instead of buying a clamp and a board.
6. Plain version first. No steampunk styling until the plain version works.
7. Any steam in the build must be functional and tied to what the camera does, not decoration. See `docs/STEAM.md`.
8. Name: Phone Tracker. Bluetooth name: `PhoneTracker`.

## Ruled out (don't bring back unless Apple asks)

- The first plan: laptop + Python + YOLO + Arduino + DroidCam.
- MG996R servos, a generic metal bracket, metal servo horns, a lazy susan bearing.
- 3D-printing the pan-tilt brackets: printed brackets wobble, and wobble makes the tracking jitter.
- "360°" or "continuous rotation" servos: they can't hold an angle.
- LD2410 and LD2410B radars: 1.27 mm pins that need soldering.
- An Arduino Uno in place of the ESP32: no Bluetooth to the iPhone.
- The FotodioX clamp or tripod kit. The $5.95 clamp alone is a fallback only if the printed holder fails.
- 1-1/2" carriage bolts: too long, and nothing to grip while tightening.
- Steam used for something unrelated to the camera, such as soothing arthritic hands.

## Architecture

| Part | Job | Connection |
|---|---|---|
| iPhone, rear camera | Sees, runs the AI, decides where to point | Bluetooth to the ESP32 |
| Adafruit ESP32 Feather V2 | Moves the servos, reads the radar | USB-C to the Mac, for uploading only |
| Pan servo (HS-422) | Left and right | Signal to ESP32 pin 27 |
| Tilt servo (HS-422) | Up and down | Signal to ESP32 pin 33 |
| LD2410C radar | OUT pin goes HIGH while someone is there | OUT to ESP32 pin 32 |
| 5V 4A supply + DC jack adapter | Powers both servos and the radar through the breadboard rails | Never power the motors from the ESP32 |

- All grounds join the breadboard's – rail, including the ESP32's GND. Without a shared ground the motors twitch.
- The radar mounts on the phone holder, facing the same way as the rear camera.
- The phone sits sideways (landscape), centered over the tilt axle.

**Bluetooth protocol**
- Service UUID `6e400001-b5a3-f393-e0a9-e50e24dcca9e`.
- Move characteristic `…0002` (write): text `pan,tilt` such as `90,90`. The firmware limits pan to 10–170° and tilt to 45–135°, and eases toward each target by 15% every 20 ms.
- Radar characteristic `…0003` (notify): `1` or `0`, sent on every change and twice a second.

**App states** (in `app/PhoneTrackerApp.swift`)
- TAP A PERSON: boxes around everyone in view; tap one to pick them.
- TRACKING: follows that person's body, so it keeps working when they turn away.
- HIDDEN: the person vanished where they stood and nobody left. Follows the cover if it moves; the radar confirms someone's inside.
- LOST: the cover went still and the radar read empty for `lostAfter` seconds. Compares everyone in view with the saved look and locks back on when one matches.

Vision tools used: `VNDetectHumanRectanglesRequest`, `VNTrackObjectRequest`, `VNGenerateImageFeaturePrintRequest`.

Tuning constants at the top of the app: `panSign`/`tiltSign` 1 (flip to -1 if a motor goes the wrong way), `strength` 8, `deadZone` 0.06, `framesBeforeHidden` 10, `lostAfter` 4 s, `matchLimit` 0.6.

**Keep firmware and app in sync.** If you change a pin, a UUID, the command format or the angle limits, change both files and this section in the same session.

## Useful numbers

- Servos: 180° per axis; keep tilt to about ±45° in practice.
- Radar: rated 0.75–6 m, a cone of about ±60°, distance in 0.75 m steps. Plan on about 3 m for a still person under a blanket (an estimate). Cap its range at about 3 m in the HLKRadarTool app.
- Camera at 1080p (estimates): faces about 5 m, clothes matching about 15 m, body tracking about 20 m.

## Files

- `CLAUDE.md`: this file, loaded every session.
- `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino`: ESP32 firmware. Arduino IDE needs the sketch folder and the .ino to share a name.
- `app/PhoneTrackerApp.swift`: the whole iPhone app in one file. When the Xcode project is created, save it inside `app/` and keep only one copy of this file.
- `print/README.md`: what to 3D-print and the requirements for each part.
- `docs/SHOPPING_LIST.md`: what to buy, where, prices, what to skip.
- `docs/BUILD_STEPS.md`: the step-by-step build, wiring, upload, test and tuning guide, plus troubleshooting.
- `docs/DEMO_AND_PITCH.md`: the 36-hour plan, demo script, judge Q&A.
- `docs/STEAM.md`: steam ideas that tie into the tracking, and the parked theme look.
- `docs/SESSION_LOG.md`: one entry per session.
- `docs/HANDOFF.md`: the original handoff from claude.ai, kept for reference.
- `docs/manuals/`: PDF build manuals, if Apple copied them in.

## Status (as of Oct 23, 2026)

- Plan: locked. Plain version first.
- Parts: carts were nearly final on Oct 17. Which orders were placed is unknown.
- Firmware: passed a syntax check against stand-in libraries. Never run on hardware.
- App: never compiled. Expect about an hour of fixes in Xcode.
- Printed parts: not designed yet.
- Steam: must be functional. Top candidate is the steam shield in `docs/STEAM.md`. Not decided.

## Open questions

1. Which iPhone model goes on the rig, and does it stay in a case? This blocks the printed holder.
2. Which orders were placed? Tick them in `docs/SHOPPING_LIST.md`.
3. Does Apple's Arduino kit include a breadboard, male/male jumper wires, and male/female jumper wires at least 30 cm long?
4. What are the event's real length, date and rules on pre-built hardware and code?
5. Which steam direction: the steam shield, steam room safety, or something else?

## Next steps

1. Finish ordering parts.
2. Answer open question 1, then design and print the phone holder and base box.
3. Decide the steam direction and add it to the firmware, app and docs.
4. When the parts arrive, follow `docs/BUILD_STEPS.md` steps 1–11.
5. Build the app in Xcode (steps 12–16), then tune (steps 17–20).
6. Rehearse the demo at least 5 times.
~~~~~

### `.gitignore`

~~~~~
.DS_Store
xcuserdata/
*.xcuserstate
DerivedData/
build/
CLAUDE.local.md
~~~~~

### `app/PhoneTrackerApp.swift`

~~~~~swift
import SwiftUI
import AVFoundation
import Vision
import CoreBluetooth

// MARK: Tuning
let panSign: Float = 1, tiltSign: Float = 1   // flip to -1 if that motor moves the wrong way
let strength: Float = 8            // how hard it chases you (degrees per frame at the edge)
let deadZone: Float = 0.06         // ignore small offsets, so it doesn't twitch
let framesBeforeHidden = 10        // about 0.5 s with nobody in the box before "Hidden"
let lostAfter: TimeInterval = 4    // Hidden + radar empty for this long = "Lost"
let matchLimit: Float = 0.6        // re-find: lower is stricter; tune with the on-screen number
let accent = Color(red: 1.0, green: 0.76, blue: 0.25)

enum Mode: String {
    case idle = "TAP A PERSON", tracking = "TRACKING", hidden = "HIDDEN", lost = "LOST"
}

final class Tracker: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate,
                     CBCentralManagerDelegate, CBPeripheralDelegate {
    // Shown on screen (main thread)
    @Published var status = "Looking for the PhoneTracker stand..."
    @Published var mode: Mode = .idle
    @Published var targetBox: CGRect?          // Vision coordinates: 0-1, origin bottom-left
    @Published var people: [CGRect] = []
    @Published var radarPresent = false
    @Published var matchText = ""

    let session = AVCaptureSession()
    private let frames = DispatchQueue(label: "frames")

    // Bluetooth
    private var central: CBCentralManager!
    private var stand: CBPeripheral?
    private var moveChar: CBCharacteristic?
    private let serviceID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    private let moveID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    private let radarID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
    private var pan: Float = 90, tilt: Float = 90
    private var lastSend = Date.distantPast

    // Tracking state: only touched on the frames queue
    private var sequence = VNSequenceRequestHandler()
    private var objectTrack: VNTrackObjectRequest?
    private var targetLook: VNFeaturePrintObservation?
    private var pendingTap: CGPoint?
    private var state: Mode = .idle
    private var lastBox: CGRect?
    private var missed = 0
    private var frameCount = 0
    private var radarNow = false
    private var radarEmptySince: Date?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
        startCamera()
    }

    // MARK: picking and releasing a target
    func pick(at visionPoint: CGPoint) { frames.async { self.pendingTap = visionPoint } }

    func release() {
        frames.async {
            self.state = .idle
            self.objectTrack = nil
            self.targetLook = nil
            self.lastBox = nil
        }
    }

    // MARK: camera (rear camera: better lens, and the screen faces you behind the stand)
    private func startCamera() {
        guard let cam = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: cam) else { return }
        session.sessionPreset = .hd1920x1080
        session.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: frames)
        session.addOutput(output)
        DispatchQueue.global().async { self.session.startRunning() }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput buffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { return }
        frameCount += 1

        // 1. Find every person in view (works from behind too)
        let humans = VNDetectHumanRectanglesRequest()
        humans.upperBodyOnly = false
        try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up).perform([humans])
        let boxes = (humans.results ?? []).map { $0.boundingBox }

        // 2. A tap picks the person under your finger
        if let tap = pendingTap {
            pendingTap = nil
            if let picked = boxes.first(where: { $0.contains(tap) }) {
                startTracking(picked)
                targetLook = look(pixels, picked)
                state = .tracking
                missed = 0
                lastBox = picked
            }
        }

        var box: CGRect?
        var match = ""

        switch state {
        case .idle:
            break

        case .tracking, .hidden:
            let tracked = followTracker(pixels)
            if let person = bestOverlap(boxes, with: tracked ?? lastBox) {
                // Target visible, facing us or turned away
                state = .tracking
                missed = 0
                radarEmptySince = nil
                if tracked == nil || frameCount % 15 == 0 { startTracking(person) }
                box = person
            } else {
                // Nobody where the target was: covered, hiding, or gone
                missed += 1
                box = tracked ?? lastBox      // follow the cover if it moves, else hold the last spot
                if tracked == nil, let b = box, frameCount % 15 == 0 { startTracking(b) }
                if state == .tracking && missed >= framesBeforeHidden {
                    state = .hidden
                    radarEmptySince = nil
                    if let b = box { startTracking(b) }   // lock onto the blanket or box itself
                }
                if state == .hidden {
                    if radarNow { radarEmptySince = nil }
                    else if radarEmptySince == nil { radarEmptySince = Date() }
                    if let since = radarEmptySince, Date().timeIntervalSince(since) > lostAfter {
                        state = .lost
                        objectTrack = nil
                        box = nil
                    }
                }
            }
            if box != nil { lastBox = box }

        case .lost:
            // Twice a second, compare everyone in view with the saved look
            if frameCount % 15 == 0, let saved = targetLook {
                var best: (box: CGRect, d: Float)?
                for b in boxes {
                    guard let l = look(pixels, b), let d = distance(saved, l) else { continue }
                    if d < (best?.d ?? .infinity) { best = (b, d) }
                }
                if let best = best {
                    match = String(format: "Closest match %.2f (locks below %.2f)", best.d, matchLimit)
                    if best.d < matchLimit {
                        startTracking(best.box)
                        state = .tracking
                        missed = 0
                        box = best.box
                        lastBox = best.box
                    }
                }
            }
        }

        let mode = state
        DispatchQueue.main.async {
            self.people = boxes
            self.targetBox = box
            self.mode = mode
            if mode != .lost { self.matchText = "" } else if !match.isEmpty { self.matchText = match }
            if let b = box { self.follow(dx: Float(b.midX - 0.5), dy: Float(b.midY - 0.5)) }
        }
    }

    // MARK: tracking helpers (frames queue)
    private func startTracking(_ box: CGRect) {
        let start = VNDetectedObjectObservation(boundingBox: box)
        let req = VNTrackObjectRequest(detectedObjectObservation: start)
        req.trackingLevel = .accurate
        objectTrack = req
        sequence = VNSequenceRequestHandler()
    }

    private func followTracker(_ pixels: CVPixelBuffer) -> CGRect? {
        guard let req = objectTrack else { return nil }
        try? sequence.perform([req], on: pixels, orientation: .up)
        guard let seen = req.results?.first as? VNDetectedObjectObservation,
              seen.confidence > 0.3 else { return nil }
        req.inputObservation = seen
        return seen.boundingBox
    }

    private func bestOverlap(_ boxes: [CGRect], with area: CGRect?) -> CGRect? {
        guard let area = area else { return nil }
        guard let best = boxes.max(by: { overlap($0, area) < overlap($1, area) }) else { return nil }
        return overlap(best, area) > 0.3 ? best : nil
    }

    private func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let i = a.intersection(b)
        if i.isNull { return 0 }
        let shared = i.width * i.height
        return shared / (a.width * a.height + b.width * b.height - shared)
    }

    // A "look" is a fingerprint of the person's crop: clothes, colors, shape
    private func look(_ pixels: CVPixelBuffer, _ box: CGRect) -> VNFeaturePrintObservation? {
        let req = VNGenerateImageFeaturePrintRequest()
        req.revision = VNGenerateImageFeaturePrintRequestRevision2
        req.regionOfInterest = box.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up).perform([req])
        return req.results?.first as? VNFeaturePrintObservation
    }

    private func distance(_ a: VNFeaturePrintObservation, _ b: VNFeaturePrintObservation) -> Float? {
        var d: Float = 0
        do { try a.computeDistance(&d, to: b); return d } catch { return nil }
    }

    // MARK: moving the stand (main thread)
    private func follow(dx: Float, dy: Float) {
        if abs(dx) > deadZone { pan = min(170, max(10, pan - panSign * dx * strength)) }
        if abs(dy) > deadZone { tilt = min(135, max(45, tilt + tiltSign * dy * strength)) }
        guard Date().timeIntervalSince(lastSend) > 0.05,
              let stand = stand, let moveChar = moveChar else { return }
        lastSend = Date()
        let text = String(format: "%.1f,%.1f", pan, tilt)
        stand.writeValue(Data(text.utf8), for: moveChar, type: .withoutResponse)
    }

    // MARK: Bluetooth
    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        if c.state == .poweredOn { c.scanForPeripherals(withServices: [serviceID]) }
    }
    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                        advertisementData: [String: Any], rssi: NSNumber) {
        stand = p; c.stopScan(); c.connect(p)
    }
    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        p.delegate = self; p.discoverServices([serviceID])
    }
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        moveChar = nil; status = "Lost the stand. Reconnecting..."
        c.scanForPeripherals(withServices: [serviceID])
    }
    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        p.services?.forEach { p.discoverCharacteristics([moveID, radarID], for: $0) }
    }
    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for c in s.characteristics ?? [] {
            if c.uuid == moveID { moveChar = c }
            if c.uuid == radarID { p.setNotifyValue(true, for: c) }
        }
        status = "Connected. Tap a person to lock on."
    }
    func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        guard c.uuid == radarID, let data = c.value else { return }
        let present = String(decoding: data, as: UTF8.self) == "1"
        radarPresent = present
        frames.async { self.radarNow = present }
    }
}

// MARK: camera view with boxes and tap-to-pick
final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    private let peopleLayer = CAShapeLayer()
    private let targetLayer = CAShapeLayer()
    var onTap: ((CGPoint) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        peopleLayer.strokeColor = UIColor.white.withAlphaComponent(0.6).cgColor
        peopleLayer.fillColor = UIColor.clear.cgColor
        peopleLayer.lineWidth = 1.5
        targetLayer.strokeColor = UIColor(red: 1.0, green: 0.76, blue: 0.25, alpha: 1).cgColor
        targetLayer.fillColor = UIColor.clear.cgColor
        targetLayer.lineWidth = 4
        layer.addSublayer(peopleLayer)
        layer.addSublayer(targetLayer)
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped(_:))))
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    @objc private func tapped(_ g: UITapGestureRecognizer) {
        let p = preview.captureDevicePointConverted(fromLayerPoint: g.location(in: self))
        onTap?(CGPoint(x: p.x, y: 1 - p.y))           // camera point -> Vision point
    }

    // Vision box (origin bottom-left) -> rectangle on screen
    private func screenRect(_ r: CGRect) -> CGRect {
        preview.layerRectConverted(fromMetadataOutputRect:
            CGRect(x: r.minX, y: 1 - r.maxY, width: r.width, height: r.height))
    }

    func draw(people: [CGRect], target: CGRect?, hidden: Bool) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let path = UIBezierPath()
        people.forEach { path.append(UIBezierPath(rect: screenRect($0))) }
        peopleLayer.path = path.cgPath
        targetLayer.path = target.map { UIBezierPath(roundedRect: screenRect($0), cornerRadius: 6).cgPath }
        targetLayer.lineDashPattern = hidden ? [10, 6] : nil
        CATransaction.commit()
    }
}

struct CameraPreview: UIViewRepresentable {
    @ObservedObject var tracker: Tracker
    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.preview.session = tracker.session
        v.preview.videoGravity = .resizeAspectFill
        v.onTap = { [weak tracker] p in tracker?.pick(at: p) }
        return v
    }
    func updateUIView(_ v: PreviewView, context: Context) {
        v.draw(people: tracker.people, target: tracker.targetBox, hidden: tracker.mode == .hidden)
    }
}

@main struct PhoneTrackerApp: App {
    @StateObject var tracker = Tracker()
    var body: some Scene {
        WindowGroup {
            ZStack(alignment: .bottom) {
                CameraPreview(tracker: tracker).ignoresSafeArea()
                VStack(spacing: 8) {
                    HStack(spacing: 10) {
                        Text(tracker.mode.rawValue)
                            .font(.system(.headline, design: .monospaced))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(accent, in: Capsule())
                            .foregroundStyle(.black)
                        Text(tracker.radarPresent ? "RADAR: SOMEONE THERE" : "RADAR: EMPTY")
                            .font(.system(.caption, design: .monospaced))
                        if tracker.mode != .idle {
                            Button("Release") { tracker.release() }.buttonStyle(.bordered).tint(accent)
                        }
                    }
                    Text(tracker.matchText.isEmpty ? tracker.status : tracker.matchText).font(.footnote)
                }
                .padding(12)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                .padding()
            }
        }
    }
}
~~~~~

### `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino`

~~~~~cpp
// Phone Tracker stand firmware for the Adafruit ESP32 Feather V2
// Receives "pan,tilt" angles over Bluetooth, moves the two servos,
// and reports the radar's presence signal back to the phone.

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <ESP32Servo.h>

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define MOVE_UUID    "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define RADAR_UUID   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

const int PAN_PIN = 27, TILT_PIN = 33;
const int RADAR_PIN = 32;   // LD2410C OUT pin: HIGH while someone is there

Servo pan, tilt;
volatile float panTarget = 90, tiltTarget = 90;
float panNow = 90, tiltNow = 90;

BLECharacteristic *radar;
int lastPresence = -1;
unsigned long lastRadarSend = 0;

// Angles in, microseconds out (HS-422: about 600-2400 us for 0-180 degrees)
int toMicros(float angle) { return 600 + angle * 10.0; }

class MoveCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue();          // e.g. "95,80"
    int comma = v.indexOf(',');
    if (comma < 0) return;
    panTarget  = constrain(v.substring(0, comma).toFloat(), 10, 170);
    tiltTarget = constrain(v.substring(comma + 1).toFloat(), 45, 135);
  }
};

class ConnectionCallback : public BLEServerCallbacks {
  void onDisconnect(BLEServer *s) override { BLEDevice::startAdvertising(); }
};

void setup() {
  pan.attach(PAN_PIN, 600, 2400);
  tilt.attach(TILT_PIN, 600, 2400);
  pinMode(RADAR_PIN, INPUT);

  BLEDevice::init("PhoneTracker");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallback());
  BLEService *service = server->createService(SERVICE_UUID);

  BLECharacteristic *move = service->createCharacteristic(
      MOVE_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  move->setCallbacks(new MoveCallback());

  radar = service->createCharacteristic(
      RADAR_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  radar->addDescriptor(new BLE2902());
  radar->setValue("0");

  service->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
}

void loop() {
  // Move 15% of the remaining distance every 20 ms: fast when far, gentle when close
  panNow  += (panTarget  - panNow)  * 0.15;
  tiltNow += (tiltTarget - tiltNow) * 0.15;
  pan.writeMicroseconds(toMicros(panNow));
  tilt.writeMicroseconds(toMicros(tiltNow));

  // Tell the phone whether the radar senses someone: on every change, and twice a second
  int present = digitalRead(RADAR_PIN);
  if (present != lastPresence || millis() - lastRadarSend > 500) {
    radar->setValue(present ? "1" : "0");
    radar->notify();
    lastPresence = present;
    lastRadarSend = millis();
  }

  delay(20);
}
~~~~~

### `print/README.md`

~~~~~markdown
# Parts to 3D-print

Apple prints on a Creality printer. Put design files (OpenSCAD `.scad`, `.stl`, `.3mf`) in this folder.

## Phone holder (replaces a bought clamp)

- **Blocked:** needs the iPhone model and whether it stays in a case.
- Holds the phone sideways (landscape), centered over the tilt axle.
- A captured-nut slot for a 1/4"-20 nut, so a 1/4"-20 × 1/2" hex bolt from below fastens it to the Lynxmotion kit's top plate.
- Leaves the rear camera, the side buttons and the charging port clear.
- A flat spot on top for the LD2410C radar, facing the same way as the rear camera.
- Measure the kit's top plate holes before finalizing the bolt position.

## Base box

- About 15 × 15 cm, heavy or weighted enough that the stand can't tip.
- Holds the half-size breadboard and the ESP32 inside, with a hole for wires and openings for the USB-C and power cables.
- The Lynxmotion kit screws or tapes to the middle of the lid.

## Small parts

- Cable clips along the bracket, so the wires don't snag as the head moves.

## If the steam feature goes ahead

Possibly a chimney or a fogger mount. See `docs/STEAM.md`.
~~~~~

### `docs/BUILD_STEPS.md`

~~~~~markdown
# Build steps

Condensed from the Phone Tracker Build Manual (River's manual, edited Oct 16, 2026). Keep everything unplugged until step 8. The one rule that protects the board: the motors and radar get power from the 5V supply, never from the ESP32.

## Install first (all free)

- **Arduino IDE 2** from https://www.arduino.cc/en/software
- **ESP32 board support:** in Arduino IDE, open Boards Manager, search "esp32" and install **esp32 by Espressif Systems**. Pick **Adafruit Feather ESP32 V2** as the board. Guide: https://learn.adafruit.com/adafruit-esp32-feather-v2/overview
- **ESP32Servo library:** Library Manager, search "ESP32Servo", install.
- **Xcode** from the Mac App Store, and a free Apple developer account, to put the app on the iPhone.
- **LightBlue** or **nRF Connect** on the iPhone, to test the stand before the app exists.
- **HLKRadarTool** on the iPhone, to cap the radar's range.

Tools: small Phillips screwdriver, wire strippers or scissors, double-sided foam tape or zip ties.

## Part A: the stand

1. **Center the motors.** The Lynxmotion kit arrives assembled. Turn the top plate by hand to the middle of its travel, and do the same for the tilt.
2. **Fix the kit to the base.** Screw or tape the bottom of the kit to the middle of the printed base box. It must not slide when the motors move.
3. **Attach the phone holder.** Push the 1/4"-20 × 1/2" hex bolt up through a hole in the kit's top plate into the nut captured in the printed holder.
4. **Balance check.** Put the phone in sideways (landscape), rear camera facing out, screen facing you. It should sit roughly over the tilt axle. Take it out again for now.
5. **Mount the radar** on top of the holder, its antenna side facing the same way as the rear camera. Leave enough wire slack for the full pan and tilt.

## Part B: the wiring

6. **Power rails.** Plug the female DC jack adapter onto the power supply's plug (supply not in the wall yet). Red wire from the adapter's **+** to the breadboard's red (+) rail; black wire from **–** to the blue (–) rail. Optional: a 1000 µF capacitor across the two rails, long leg on +.
7. **Connect everything.** Each HS-422 has black (ground), red (power) and yellow (signal) wires. Check the pin numbers printed on the ESP32.

| From | To |
|---|---|
| Pan red, tilt red | Breadboard + rail |
| Pan black, tilt black | Breadboard – rail |
| Pan yellow | ESP32 pin 27 |
| Tilt yellow | ESP32 pin 33 |
| ESP32 GND | Breadboard – rail |
| Radar VCC (or 5V) | Breadboard + rail |
| Radar GND | Breadboard – rail |
| Radar OUT | ESP32 pin 32 |

   Nothing connects to the ESP32's 3V or USB pins. The radar's OUT pin is 3.3 V, which is safe for the ESP32.

8. **Double-check, then power up.** Compare every wire with the table. Plug the supply into the wall and the ESP32 into the Mac with a USB-C data cable.

## Part C: the firmware

9. **Upload.** Open `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino` in Arduino IDE, pick **Adafruit Feather ESP32 V2** and its port, click Upload. It advertises Bluetooth as **PhoneTracker**.
   - Written for version 3 of the ESP32 board package. On version 2, change `String v = c->getValue();` to `String v = c->getValue().c_str();`.
   - If `BLE2902.h` won't compile, delete its include line and the `addDescriptor` line.
10. **Test from the phone.** In LightBlue, connect to **PhoneTracker**. On the characteristic ending **0002**, write UTF-8 text one at a time: `90,90` (center), `40,90`, `140,90`, `90,60`, `90,120`. A motor turning the "wrong" way is fine; the app flips it. Then subscribe to the characteristic ending **0003**: it should read `1` while you stand in front of the radar and drop to `0` a few seconds after you leave.
11. **Put the phone back in** and repeat the motor test. If it shakes or the tilt sags, re-check the balance (step 4).

## Part D: the app

12. **Create the project.** In Xcode: File → New → Project → iOS App. Name it **PhoneTracker**, interface SwiftUI. Save it inside this repo's `app/` folder.
13. **Permissions.** In the target's Info tab, add:
    - `Privacy - Camera Usage Description`: "Finds the person you picked so the stand can follow them."
    - `Privacy - Bluetooth Always Usage Description`: "Talks to the PhoneTracker stand."
14. **Build setting.** In Build Settings, set "Default Actor Isolation" to **nonisolated**. If concurrency errors remain, set "Swift Language Version" to **Swift 5**.
15. **Add the code.** Replace everything in the project's `PhoneTrackerApp.swift` with `app/PhoneTrackerApp.swift`, and delete `ContentView.swift`. Then keep only one copy of the file in the repo. The code has never been compiled, so budget about an hour for small fixes.
16. **Run it.** Plug the iPhone into the Mac, pick it as the run target, press Run. The first time, trust the developer certificate on the phone (Settings → General → VPN & Device Management) and allow Camera and Bluetooth.

## Part E: tuning

17. **Directions.** Phone in the stand sideways, tap yourself, step to one side. If the stand turns away from you, set `panSign` to `-1`. Same for `tiltSign` when you crouch or stand.
18. **Feel.** Overshoots and wobbles: lower `strength` to 5. Too slow: raise it to 12. Twitches while you stand still: raise `deadZone` to 0.1.
19. **Hiding.** Get under a blanket within about 3 m. The box should turn dashed and say HIDDEN within half a second. If it flickers to HIDDEN while you walk, raise `framesBeforeHidden` to 15–20. In HLKRadarTool, cap the radar's range at about 3 m.
20. **Re-finding.** Slip out of view and wait for LOST. Note the "Closest match" number when you walk back in, then when a teammate walks in. Set `matchLimit` between the two.

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Motors twitch or buzz | ESP32 GND not on the – rail | Add the GND wire (step 7) |
| ESP32 restarts when a motor moves | Motors powered from the ESP32 | Move both red wires to the 5V rail |
| Upload fails | Charge-only cable, or wrong port | Try another cable; pick the port that appears when you plug in |
| LightBlue doesn't see the stand | Firmware not running, or the app connected first | Press the ESP32's reset button; close the iPhone app |
| Stand turns away from you | Motor direction flipped | `panSign` or `tiltSign` to `-1` |
| Swings past you and back | Chasing too hard | Lower `strength` |
| Tilt sags or shakes | Phone off the tilt axle | Re-center it (step 4) |
| Xcode actor or concurrency errors | New-project default | Step 14 |
| Radar always reads someone there | It sees people behind the target | Cap its range at about 3 m; aim away from crowds |
| Radar reads 0 under the blanket | Too far, aimed wrong, or metal in front | Stay within 3 m; face it the way the camera faces; keep metal away |
| Flickers to HIDDEN while walking | Detector missed a few frames | `framesBeforeHidden` to 15–20 |
| Never goes LOST | Radar still senses someone nearby | Shorten the radar range, or lower `lostAfter` |
| Locks onto the wrong person | `matchLimit` too loose | Lower it (step 20) |
| Never locks back on | `matchLimit` too strict, or the target changed clothes | Raise it (step 20) |

## Reference videos and guides

They use slightly different parts; follow this file for pins and code.

- Pan-tilt bracket assembly: https://www.youtube.com/watch?v=Rpc4Pk7T09E
- DIY servo mounts: https://www.youtube.com/watch?v=SUXvdHxVoQQ
- Two servos on an ESP32 for pan and tilt: https://www.youtube.com/watch?v=Rm_R0MAmHHA
- Servo control over Bluetooth from a phone: https://www.youtube.com/watch?v=5TlEgfFDrzI
- ESP32 BLE server servo control: https://www.youtube.com/watch?v=GKpnU84tFXg
- A phone app that talks to an ESP32 over BLE: https://youtube.com/watch?v=RvbWl8rZOoQ
- Face-tracking camera with computer vision: https://www.youtube.com/watch?v=icdbFx0uJu0
- Cambot motion-tracking camera: https://www.youtube.com/watch?v=nbJNLVBo_g4
- Random Nerd Tutorials, ESP32 BLE: https://randomnerdtutorials.com/esp32-bluetooth-low-energy-ble-arduino-ide/
- Random Nerd Tutorials, ESP32 servos: https://randomnerdtutorials.com/esp32-servo-motor-web-server-arduino-ide/
- Turret Face Tracker on GitHub: https://github.com/AshishA26/Turret-Face-Tracker
- Apple DockKit (ready-made tracking stands, a no-build alternative): https://developer.apple.com/documentation/dockkit
~~~~~

### `docs/DEMO_AND_PITCH.md`

~~~~~markdown
# Demo and pitch

## 36-hour plan

| Hours | Goal | Done when |
|---|---|---|
| Before | Order parts, print and test-fit the holder and base, install software, wire once at home | Everything arrives and fits |
| 0–3 | Stand assembled, wired, firmware on | LightBlue moves both motors and the radar reads 1 and 0 |
| 3–7 | App on the phone | It follows you around the room |
| 7–12 | Hidden mode | It follows you as you crawl under a blanket |
| 12–15 | Radar and the Lost rule | An empty blanket goes LOST within about 5 s |
| 15–21 | Sleep | Seriously |
| 21–25 | Re-finding | It locks back onto you, not your teammate |
| 25–29 | Steam feature, if decided, and polish | It works the same way three times in a row |
| 29–33 | Rehearse at least 5 times | Same result every run |
| 33–36 | Pitch and buffer | Slides ready, rig packed |

If behind schedule, cut in this order: the steam feature, re-finding, then the radar. Protect the Hidden demo: someone crawling under a blanket while the camera follows the lump is the moment judges will remember.

## Main demo

1. A volunteer stands in view. Tap them on the phone; the stand locks on (TRACKING).
2. They turn their back and walk; it keeps following.
3. They crawl under a blanket. The box goes dashed (HIDDEN) and the radar shows someone's there.
4. They crawl across the floor under the blanket; the camera follows the lump.
5. They pop out; it's still locked on.

## Extra demos for "what else can it do?"

1. **Pick a judge:** a judge taps their own face, then tries to lose the camera.
2. **Crowd swap:** two or three people cross paths; it stays on the right one.
3. **Leave and return:** the target walks out and back in from another spot; it re-finds them.
4. **Decoy blanket:** the target slips out and leaves an empty lump; the radar reads empty, so it isn't fooled.
5. **The log:** show why it made each call ("covered, nobody left, so still here").

## Honest limits, if asked

- **Range:** the radar is rated to about 6 m; a stronger radar module would extend it.
- **Two people at once:** the software sees everyone, but one camera can only point at one person.
- **Through walls:** no. The radar works through fabric, cardboard and fog, not walls.
- **Shell game:** two identical boxes shuffled around can fool it, and so can covering up out of view.

## Use cases

- **Worker safety in steel and steam:** steel mills, foundries and boiler rooms fill with steam that blinds cameras; the radar keeps confirming a worker is there.
- **Elder care:** someone still in bed under the covers at night.
- **Self-filming:** creators and coaches who need a camera that follows them.

## "Isn't this surveillance?"

"Everything runs on the phone, nothing is recorded, and it only tracks someone who opted in."
~~~~~

### `docs/SESSION_LOG.md`

~~~~~markdown
# Session log

Newest entry at the top. Add one entry at the end of every session.

## 2026-10-23 — Project moved to Claude Code

- Set up this folder from the claude.ai handoff file (`docs/HANDOFF.md`).
- Next: answer the open questions in `CLAUDE.md`, starting with the iPhone model and case.

## 2026-10-16 to 2026-10-23 — Planning in claude.ai (before this folder existed)

- **Idea:** a pan-tilt camera that tracks a chosen person through turning away and hiding under covers, for SBUHacks 2026.
- **First plan, replaced:** laptop running Python and YOLO, a phone streaming over DroidCam, an Arduino driving MG996R servos on a printed yoke, plus the radar.
- **Partner River's manual** brought the current setup: an iPhone app with Apple Vision, an ESP32 Feather V2 over Bluetooth, and the Lynxmotion kit. Apple edited it to add tap-to-pick, the Hidden and Lost states, the LD2410C radar, and the rear camera.
- **Themed version built and parked:** "Iron Owl" with a brass boiler base and a steam puff on pin 14. The team chose a plain version first.
- **Shopping list trimmed:** print the phone holder instead of buying a clamp; skip the FotodioX tripod kit; swap the carriage bolts for a 1/2" hex bolt; add the missing power supply. About $104.
- **Steam:** the team wants functional steam. The arthritis idea was rejected as tacked on. Ideas: steam shield (top pick), steam room safety, auto follow-spot. Not decided.
- **Earlier visuals** (claude.ai artifacts, private to Apple, open in a browser; Claude Code can't read them):
  - 3D rig model, themed Iron Owl version: https://claude.ai/artifact/Mr5N95FuAARQME94qA2SBg
  - Older 3D rig model (outdated MG996R plan): https://claude.ai/artifact/XCnJdYoqh1iV8dWPrWYm7t
  - App and rig mockups (outdated laptop plan; the four tracking states still apply): https://claude.ai/artifact/DmaFX8LPsGMDNH181ZbjFD
~~~~~

### `docs/SHOPPING_LIST.md`

~~~~~markdown
# Shopping list

Last checked Oct 17, 2026. Tick each box once it's actually ordered.

## Buy

| ✓ | Part | Where | Price | Notes |
|---|---|---|---|---|
| [ ] | Lynxmotion Pan and Tilt Kit | RobotShop, SKU RB-Lyn-74, manufacturer # **BPT-KT** | $48.65 | Includes 2× Hitec HS-422 servos. RobotShop also sells a no-servo version, so check the part number. |
| [ ] | Adafruit ESP32 Feather V2 **with headers** | Adafruit, PID 5900 | $20.95 | Not the $19.95 version without headers, which needs soldering. |
| [ ] | Adafruit 5V 4A power supply | Adafruit, PID 1466 | $14.95 | Wasn't in the Adafruit cart on Oct 17. Order it with the ESP32. |
| [ ] | California JOS DC jack adapters, 2 male + 2 female, 2.1 × 5.5 mm | Amazon | $3.97 | Use one of the **female** ones. |
| [ ] | Coliao LD2410C radar, 2-pack | Amazon | $14.99 | The second one is a spare. |
| [ ] | 1/4"-20 × 1/2" **hex-head** bolt with a nut | Any hardware store | about $1 | Holds the printed phone holder to the kit's top plate. |

About $104 total, plus shipping and tax.

## Remove from the carts

- [ ] Mywish carriage bolts, 1/4-20 × 1-1/2" (Amazon, $9.99): too long, and the round head can't be gripped.

## Check the Arduino kit first; buy only what's missing

- [ ] Half-size breadboard (Adafruit PID 64, $4.95)
- [ ] Male/male jumper wires (Adafruit PID 1957, $1.95)
- [ ] Male/female jumper wires, at least 30 cm, for the radar. The wires bundled with the radar may be female on both ends.
- [ ] Optional: 1000 µF electrolytic capacitor, 10 V or more (about $1), only if the motors jitter.

Without the carriage bolts the Amazon subtotal is about $19, under the $35 free-shipping minimum, so shipping is $6.99.

## Already have

- iPhone (goes on the rig), Mac with Xcode
- USB-C cable that carries data, not a charge-only one
- Creality 3D printer and filament
- Small Phillips screwdriver, foam tape or zip ties

## Steam parts

Not decided yet. See `docs/STEAM.md` for options and rough prices.

## Don't buy

FotodioX clamp or tripod kit · a wooden base board · MG996R servos · a generic pan-tilt bracket · metal servo horns · a lazy susan bearing · DroidCam Pro · a 6 ft USB cable
~~~~~

### `docs/STEAM.md`

~~~~~markdown
# Steam

The hackathon theme is "Steel and Steam", and the team wants steam in the build. The team's rule: the steam must be **functional and tied to what the camera does**, not something bolted on to meet the theme.

**Test for any steam idea:** take the camera away. If the steam still makes sense on its own, it's a separate project bolted on. (A friend's idea of steam for soothing arthritic hands fails this test, so it's ruled out.)

Steam fits in one of two ways:
- **The rig makes steam for a reason that depends on the tracking.**
- **Steam is the problem the tracking is built to beat.**

The rig's edge: the radar and the Hidden rule keep the lock when the camera can't see. Steam is exactly what blinds cameras. The LD2410C works at 24 GHz, which passes through fog and water droplets.

## Option 1: Steam shield (top candidate, not yet decided)

- **Idea:** security fog machines already exist; shops and warehouses fill a room with fog the moment an alarm goes off, so a thief can't see what to grab. Their catch is that the fog blinds the security cameras too. This rig fogs the area and keeps tracking the intruder through it, using the radar and object permanence.
- **Why it fits:** the steam is the defense, and the tracking is what makes fogging usable. Each half needs the other.
- **Demo:** a valuable prop in a clear plastic tote with a mist maker inside. When the tracked person reaches for it, the ESP32 fills the tote with steam. A second fog-filled tote between the camera and the person: the camera loses them, but the radar and the Hidden rule hold the lock.
- **Build notes:** the trigger could be the target's box entering a "no-go zone" in the frame. The app sends a command; the ESP32 switches the fogger through a MOSFET on pin 14 (the first themed draft used pin 14 and a `puff` command).

## Option 2: Steam room safety

- **Idea:** people faint in steam rooms and saunas, and staff can't see them through the steam. The rig locks onto each person as they enter, keeps tracking through the steam, and raises an alert if someone stops moving for too long. The same idea works for workers in steamy boiler rooms and steel mills.
- **Why it fits:** it uses all four tracking states as they are.
- **Extra work:** the radar's OUT pin only says "someone there". To detect "stopped moving", the ESP32 must read the radar's serial data, which reports moving and still targets separately (for example with the ncmreynolds `ld2410` Arduino library). Moderate firmware addition.
- **Demo:** a fog-filled tote in front of the camera simulates the steam room; someone lying still behind it triggers the alert.

## Option 3: Auto follow-spot (weaker)

- **Idea:** theaters fill the stage with haze so spotlight beams show up, and a person aims each follow-spot by hand. Add a narrow LED spotlight to the rig; it follows a performer automatically, with the beam visible in the mist.
- **Why it's weaker:** the steam only makes the beam visible; it doesn't connect to the hard part of the tracking. Never use a laser instead of the LED, because it would shine in people's eyes.

## Recommendation

Use the steam shield as the build feature, and the steam room as a second use case in the pitch.

## Tests before committing

- **Fog density:** one small 5V mist maker fills a closed tote slowly. A multi-head pond fogger is much faster but needs its own power supply. Check whether a fogged tote really blocks the camera.
- **Radar through the tote:** thin plastic and fog should barely affect it. Test it.
- **Venue:** ask the organizers about water mist. A closed tote keeps it contained. Real fog machines can set off smoke detectors.
- Keep the blanket demo as the backup.

## Parts (rough prices, check before buying)

- 5V ultrasonic mist maker that starts misting as soon as it gets power (no on button): about $8–12.
- Or a multi-head pond fogger with its own 24V supply: about $20–35.
- MOSFET switch module that triggers from 3.3V: about $3–5.
- Clear plastic tote(s).

## Safety

- Ultrasonic mist is cold, so it can't burn anyone.
- Use distilled water, or the mist leaves white dust everywhere.
- Keep water below and away from the electronics and the camera lens.

## Smaller extras (only after a functional steam feature works)

- **Steam signals:** one puff on lock-on, two when Hidden, one long puff when Lost.
- **The machine breathes:** while Hidden and the radar senses someone, puff softly every few seconds.
- **Phone sounds:** the iPhone plays a hiss on lock-on and a whistle on re-find. No hardware.
- **Steam-valve control:** a printed handwheel on a rotary encoder releases the target or recenters the camera.

## Parked theme look (from the first chat)

- Name idea: "The Iron Owl". Pitch line: "A Victorian watchman automaton that never loses sight of you, even under a blanket."
- Printed brass-painted boiler base with rivets and a chimney (electronics inside), side gears, a lens hood around the rear camera.
- Metallic paint blocks radar, so keep it off anything in front of the radar.
- Brass status pill, target box and dial gauges in the app.
~~~~~

---

End of handoff. Everything above the Files section is instructions; everything inside the tilde fences is file content.
