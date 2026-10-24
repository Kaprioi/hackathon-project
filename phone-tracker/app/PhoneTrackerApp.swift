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
