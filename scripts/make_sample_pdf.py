"""Generate the fictional two-page document used for the browser upload demonstration."""

from pathlib import Path
from reportlab.pdfgen import canvas

target = Path(__file__).resolve().parents[1] / "fixtures" / "studio-handbook.pdf"
pdf = canvas.Canvas(str(target), pagesize=(595, 842))
pdf.setTitle("Studio handbook - fictional EvidenceDesk example")
pdf.setFillColorRGB(0.08, 0.09, 0.10)
pdf.rect(0, 0, 595, 842, fill=1, stroke=0)
pdf.setFillColorRGB(1, 0.71, 0.48)
pdf.setFont("Helvetica-Bold", 32)
pdf.drawString(48, 705, "Studio handbook")
pdf.setFillColorRGB(0.98, 0.97, 0.96)
pdf.setFont("Helvetica", 13)
pdf.drawString(48, 665, "A fictional document for EvidenceDesk portfolio demonstrations.")
pdf.drawString(48, 635, "Version 1 | The policy details are on page 2.")
pdf.showPage()
pdf.setFont("Helvetica-Bold", 24)
pdf.drawString(48, 755, "Studio team policies")
pdf.setFont("Helvetica", 13)
for y, line in zip(
    (690, 650, 610, 570),
    (
        "The annual leave allowance is 24 days per year.",
        "Book a studio desk at least 72 hours before arrival.",
        "Studio visitor badges must be returned at the reception desk.",
        "These policies belong to a fictional studio and are not employment advice.",
    ),
):
    pdf.drawString(48, y, line)
pdf.save()
print("Fictional sample PDF created:", target.name)
