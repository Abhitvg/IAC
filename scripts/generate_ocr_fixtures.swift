import Cocoa
import PDFKit

func drawTextLines(lines: [String], ctx: CGContext, width: CGFloat, height: CGFloat, fontSize: CGFloat = 15) {
    // Fill background white
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    
    let gc = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = gc
    
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.boldSystemFont(ofSize: fontSize),
        .foregroundColor: NSColor.black
    ]
    
    var currentY: CGFloat = height - 100
    for line in lines {
        let str = NSString(string: line)
        str.draw(at: NSPoint(x: 50, y: currentY), withAttributes: attrs)
        currentY -= (fontSize * 1.8)
    }
}

func createPageFromLines(lines: [String], width: CGFloat = 612, height: CGFloat = 792, fontSize: CGFloat = 15) -> PDFPage {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(
        data: nil,
        width: Int(width),
        height: Int(height),
        bitsPerComponent: 8,
        bytesPerRow: Int(width) * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    
    drawTextLines(lines: lines, ctx: ctx, width: width, height: height, fontSize: fontSize)
    
    let cgImage = ctx.makeImage()!
    let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: width, height: height))
    return PDFPage(image: nsImage)!
}

func generateFixtures() {
    let outputDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "tests/fixtures/ocr"
    try? FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true, attributes: nil)
    
    // 1. Scanned Single Page Resume
    let singleDoc = PDFDocument()
    singleDoc.insert(createPageFromLines(lines: [
        "CANDIDATE: Samantha Vance",
        "ROLE: Lead Site Reliability Architect",
        "SKILLS: Kubernetes, Prometheus, Terraform, Golang",
        "SUMMARY: 10 years optimizing high-scale distributed systems"
    ]), at: 0)
    singleDoc.write(toFile: "\(outputDir)/scanned_single_page.pdf")
    
    // 2. Scanned Three Page Resume
    let threeDoc = PDFDocument()
    threeDoc.insert(createPageFromLines(lines: [
        "PAGE 1: CANDIDATE PROFILE",
        "CANDIDATE: Marcus Sterling",
        "ROLE: Principal Cloud Infrastructure Engineer",
        "EXPERIENCE: Cloud Platform Lead at Global Systems"
    ]), at: 0)
    threeDoc.insert(createPageFromLines(lines: [
        "PAGE 2: ARCHITECTURE AND DISTRIBUTED SYSTEMS",
        "Designed multi-region active-active failover with sub-second replication latency",
        "Managed 450 Kubernetes worker nodes across three cloud providers"
    ]), at: 1)
    threeDoc.insert(createPageFromLines(lines: [
        "PAGE 3: METRICS AND BUSINESS IMPACT",
        "Reduced cloud infrastructure expenditures by 38 percent",
        "Maintained 99.995 percent service availability over 24 consecutive months"
    ]), at: 2)
    threeDoc.write(toFile: "\(outputDir)/scanned_three_page.pdf")
    
    // 3. Scanned Multilingual Document (French)
    let multiDoc = PDFDocument()
    multiDoc.insert(createPageFromLines(lines: [
        "CANDIDAT: Jean-Luc Dupont",
        "INGENIEUR SYSTEMES ET RESEAUX",
        "EXPERIENCE: Societe Generale, Paris, France",
        "DEVELOPPEMENT D'APPLICATIONS CRITIQUES EN GO ET KUBERNETES"
    ]), at: 0)
    multiDoc.write(toFile: "\(outputDir)/scanned_multilingual.pdf")
    
    // 4. Short Valid Resume
    let shortDoc = PDFDocument()
    shortDoc.insert(createPageFromLines(lines: [
        "Devon Price",
        "Staff Software Engineer",
        "Specializing in Compiler Design and Rust"
    ]), at: 0)
    shortDoc.write(toFile: "\(outputDir)/short_resume.pdf")
    
    // 5. Unusual CID Font Scanned Simulation
    let cidDoc = PDFDocument()
    cidDoc.insert(createPageFromLines(lines: [
        "CANDIDATE: Jordan Lee",
        "ROLE: Senior Distributed Database Architect",
        "ACHIEVEMENTS: Optimized Cassandra read throughput by 65 percent"
    ]), at: 0)
    cidDoc.write(toFile: "\(outputDir)/unusual_cid_mojibake.pdf")
    
    // 6. Twelve Page Document to test 10-page enforcement
    let twelveDoc = PDFDocument()
    for i in 1...12 {
        twelveDoc.insert(createPageFromLines(lines: [
            "DOCUMENT PAGE \(i) OF 12",
            "CANDIDATE AUDIT LOG: Marcus Sterling",
            "VERIFICATION HASH: PAGE-\(i)-SECURE-TOKEN"
        ]), at: i - 1)
    }
    twelveDoc.write(toFile: "\(outputDir)/scanned_twelve_page.pdf")
    
    print("Successfully generated all 6 OCR test fixture PDFs in \(outputDir)")
}

generateFixtures()
