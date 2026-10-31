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

func createRealisticTwoColumnPage(width: CGFloat = 612, height: CGFloat = 792) -> PDFPage {
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
    
    // Background
    ctx.setFillColor(CGColor(red: 0.98, green: 0.98, blue: 0.98, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    
    // Left column background tint
    ctx.setFillColor(CGColor(red: 0.93, green: 0.94, blue: 0.96, alpha: 1))
    ctx.fill(CGRect(x: 30, y: 30, width: 170, height: height - 60))
    
    let gc = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = gc
    
    let headerFont = NSFont.boldSystemFont(ofSize: 18)
    let sectionFont = NSFont.boldSystemFont(ofSize: 13)
    let bodyFont = NSFont.systemFont(ofSize: 11)
    
    // Left Column Content
    let leftX: CGFloat = 45
    var leftY: CGFloat = height - 70
    
    NSString(string: "CONTACT").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: sectionFont, .foregroundColor: NSColor.darkGray])
    leftY -= 20
    NSString(string: "alex@distributed.io").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: bodyFont])
    leftY -= 16
    NSString(string: "github.com/alex-dist").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: bodyFont])
    
    leftY -= 35
    NSString(string: "EDUCATION").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: sectionFont, .foregroundColor: NSColor.darkGray])
    leftY -= 20
    NSString(string: "B.S. Computer Science").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: bodyFont])
    leftY -= 16
    NSString(string: "Stanford University").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: bodyFont])
    
    leftY -= 35
    NSString(string: "CORE SKILLS").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: sectionFont, .foregroundColor: NSColor.darkGray])
    leftY -= 20
    let skills = ["Apache Kafka", "Cassandra", "Kubernetes", "Rust & Golang", "eBPF Tracing", "gRPC Systems"]
    for s in skills {
        NSString(string: "• \(s)").draw(at: NSPoint(x: leftX, y: leftY), withAttributes: [.font: bodyFont])
        leftY -= 18
    }
    
    // Right Column Content
    let rightX: CGFloat = 225
    var rightY: CGFloat = height - 70
    
    NSString(string: "CANDIDATE: Alex Rivera").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: headerFont])
    rightY -= 24
    NSString(string: "ROLE: Principal Infrastructure Architect").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 13), .foregroundColor: NSColor.purple])
    
    rightY -= 35
    NSString(string: "PROFESSIONAL SUMMARY").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: sectionFont])
    rightY -= 20
    NSString(string: "Specialist in real-time stream processing architectures and distributed storage engines.").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: bodyFont])
    rightY -= 16
    NSString(string: "Over 12 years designing fault-tolerant high-throughput platforms.").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: bodyFont])
    
    rightY -= 35
    NSString(string: "KEY ACHIEVEMENTS & PRODUCTION METRICS").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: sectionFont])
    rightY -= 22
    NSString(string: "1. Re-architected core ingestion pipeline,").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: bodyFont])
    rightY -= 16
    NSString(string: "   increasing throughput by 70 percent.").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: bodyFont])
    rightY -= 20
    NSString(string: "2. Mitigated database write amplification under load.").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: bodyFont])
    rightY -= 20
    NSString(string: "3. Scaled message bus to 25 million events per second.").draw(at: NSPoint(x: rightX, y: rightY), withAttributes: [.font: bodyFont])
    
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
    
    // 4. Accented French Document (Strict Accents: é, è, ê, à, ç, ô)
    let accentedFrenchDoc = PDFDocument()
    accentedFrenchDoc.insert(createPageFromLines(lines: [
        "CANDIDAT: Éléonore de la Tour",
        "RÔLE: Ingénieure Systèmes & Architecte Déploiement",
        "COMPÉTENCES: Kubernetes, Réseaux Résilients, Modélisation, Événements",
        "EXPÉRIENCE: Société Générale, Paris — Déploiement à grande échelle"
    ]), at: 0)
    accentedFrenchDoc.write(toFile: "\(outputDir)/scanned_accented_french.pdf")
    
    // 5. Genuinely Non-Latin Script (Cyrillic - Supported by Vision ru-RU)
    let nonLatinDoc = PDFDocument()
    nonLatinDoc.insert(createPageFromLines(lines: [
        "КАНДИДАТ: Олександр Шевченко",
        "ПОСАДА: Провідний інженер системної надійності",
        "НАВИЧКИ: Кубернетес, Розподілені бази даних, Відмовостійкість",
        "ДОСВІД: Оптимізація продуктивності хмарних кластерів"
    ]), at: 0)
    nonLatinDoc.write(toFile: "\(outputDir)/scanned_non_latin_script.pdf")
    
    // 6. Realistic Two-Column Layout Resume
    let realisticDoc = PDFDocument()
    realisticDoc.insert(createRealisticTwoColumnPage(), at: 0)
    realisticDoc.write(toFile: "\(outputDir)/scanned_realistic_layout.pdf")
    
    // 7. Short Valid Resume
    let shortDoc = PDFDocument()
    shortDoc.insert(createPageFromLines(lines: [
        "Devon Price",
        "Staff Software Engineer",
        "Specializing in Compiler Design and Rust"
    ]), at: 0)
    shortDoc.write(toFile: "\(outputDir)/short_resume.pdf")
    
    // 8. Unusual CID Font Scanned Simulation
    let cidDoc = PDFDocument()
    cidDoc.insert(createPageFromLines(lines: [
        "CANDIDATE: Jordan Lee",
        "ROLE: Senior Distributed Database Architect",
        "ACHIEVEMENTS: Optimized Cassandra read throughput by 65 percent"
    ]), at: 0)
    cidDoc.write(toFile: "\(outputDir)/unusual_cid_mojibake.pdf")
    
    // 9. Twelve Page Document to test 10-page enforcement
    let twelveDoc = PDFDocument()
    for i in 1...12 {
        twelveDoc.insert(createPageFromLines(lines: [
            "DOCUMENT PAGE \(i) OF 12",
            "CANDIDATE AUDIT LOG: Marcus Sterling",
            "VERIFICATION HASH: PAGE-\(i)-SECURE-TOKEN"
        ]), at: i - 1)
    }
    twelveDoc.write(toFile: "\(outputDir)/scanned_twelve_page.pdf")
    
    print("Successfully generated all OCR test fixture PDFs in \(outputDir)")
}

generateFixtures()
