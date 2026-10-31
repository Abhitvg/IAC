import Cocoa
import Vision
import PDFKit

// Global process watchdog: terminate if total execution exceeds 45s
DispatchQueue.global().asyncAfter(deadline: .now() + 45.0) {
    fputs("ERROR: OCR process exceeded global watchdog limit (45s)\n", stderr)
    exit(2)
}

func performOcrOnCgImage(cgImage: CGImage) -> String {
    var resultText = ""

    let request = VNRecognizeTextRequest { request, error in
        if let error = error {
            fputs("WARNING: Vision OCR page error: \(error.localizedDescription)\n", stderr)
            return
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
        resultText = lines.joined(separator: "\n")
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
        // VNImageRequestHandler.perform is synchronous and blocks until request completion
        try handler.perform([request])
    } catch {
        fputs("WARNING: Vision handler failed: \(error.localizedDescription)\n", stderr)
    }

    return resultText
}

func performOCR(filePath: String) {
    let url = URL(fileURLWithPath: filePath)
    let isPdf = url.pathExtension.lowercased() == "pdf"

    if isPdf {
        guard let doc = PDFDocument(url: url) else {
            fputs("ERROR: Failed to open PDF document from \(filePath)\n", stderr)
            exit(1)
        }

        let maxPages = min(doc.pageCount, 10)
        var pageTexts: [String] = []

        for i in 0..<maxPages {
            guard let page = doc.page(at: i) else { continue }
            let pageRect = page.bounds(for: .mediaBox)

            // Dimension bound: reject invalid, zero, or absurd dimensions (> 5000 points = ~70 inches)
            if pageRect.width <= 0 || pageRect.height <= 0 || pageRect.width > 5000 || pageRect.height > 5000 {
                fputs("WARNING: Skipping page \(i + 1): out-of-bounds dimensions (\(pageRect.width) x \(pageRect.height))\n", stderr)
                continue
            }

            // Clamp scale so rendered dimension never exceeds 3000 x 3000 pixels
            var scale: CGFloat = 2.0 // Standard 144 DPI
            if (pageRect.width * scale > 3000) || (pageRect.height * scale > 3000) {
                scale = min(3000.0 / pageRect.width, 3000.0 / pageRect.height)
            }

            let width = max(Int(pageRect.width * scale), 100)
            let height = max(Int(pageRect.height * scale), 100)

            // Memory bound: max 36MB bitmap buffer per page
            let estimatedMemoryBytes = width * height * 4
            if estimatedMemoryBytes > 36 * 1024 * 1024 {
                fputs("WARNING: Skipping page \(i + 1): rendered bitmap memory footprint exceeds 36MB\n", stderr)
                continue
            }

            let colorSpace = CGColorSpaceCreateDeviceRGB()
            guard let ctx = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else {
                continue
            }

            ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
            ctx.scaleBy(x: scale, y: scale)
            page.draw(with: .mediaBox, to: ctx)

            guard let cgImage = ctx.makeImage() else { continue }
            let text = performOcrOnCgImage(cgImage: cgImage)
            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                pageTexts.append(text)
            }
        }

        let fullOutput = pageTexts.joined(separator: "\n\n--- Page Break ---\n\n")
        if let data = (fullOutput + "\n").data(using: .utf8) {
            FileHandle.standardOutput.write(data)
        }
        return
    }

    // Standard single-image file
    guard let image = NSImage(contentsOf: url),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fputs("ERROR: Failed to load image from \(filePath)\n", stderr)
        exit(1)
    }

    let output = performOcrOnCgImage(cgImage: cgImage)
    if let data = (output + "\n").data(using: .utf8) {
        FileHandle.standardOutput.write(data)
    }
}

if CommandLine.arguments.count > 1 {
    performOCR(filePath: CommandLine.arguments[1])
} else {
    fputs("Usage: mac-ocr <file-path>\n", stderr)
    exit(1)
}
