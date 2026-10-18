import Cocoa
import Vision

func performOCR(imagePath: String) {
    let url = URL(fileURLWithPath: imagePath)
    guard let image = NSImage(contentsOf: url),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fputs("ERROR: Failed to load image from \(imagePath)\n", stderr)
        exit(1)
    }

    let request = VNRecognizeTextRequest { request, error in
        if let error = error {
            fputs("ERROR: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
        guard let observations = request.results as? [VNRecognizedTextObservation] else {
            return
        }
        
        let sorted = observations.sorted { (a, b) -> Bool in
            let aY = a.boundingBox.origin.y
            let bY = b.boundingBox.origin.y
            if abs(aY - bY) > 0.02 {
                return aY > bY
            }
            return a.boundingBox.origin.x < b.boundingBox.origin.x
        }

        let lines = sorted.compactMap { $0.topCandidates(1).first?.string }
        let fullText = lines.joined(separator: "\n")
        if let data = (fullText + "\n").data(using: .utf8) {
            FileHandle.standardOutput.write(data)
        }
    }

    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    if #available(macOS 13.0, *) {
        request.revision = 3
    }
    request.recognitionLanguages = [
        "en-US", "es-ES", "fr-FR", "de-DE", "pt-BR", "it-IT",
        "zh-Hans", "zh-Hant", "ja-JP", "ko-KR", "ru-RU"
    ]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        fputs("ERROR: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

if CommandLine.arguments.count > 1 {
    performOCR(imagePath: CommandLine.arguments[1])
} else {
    fputs("Usage: mac-ocr <image-path>\n", stderr)
    exit(1)
}
