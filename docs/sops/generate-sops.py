#!/usr/bin/env python3
"""
Generate mock AMM SOP PDFs for Lore demo.
Aviation MRO context: CFM56-5B engine, Airbus A320.
All content is FICTIONAL  -  not for operational use.
"""

from fpdf import FPDF
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


class AMMPDF(FPDF):
    """Custom PDF class for AMM-style documents."""

    def __init__(self, chapter, section, title, revision="DEMO-001", date="01 MAR 2026"):
        super().__init__()
        self.chapter = chapter
        self.section = section
        self.doc_title = title
        self.revision = revision
        self.date = date
        self.set_auto_page_break(auto=True, margin=25)

    def header(self):
        # Top border line
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.5)
        self.line(10, 8, 200, 8)

        # Header row
        self.set_font("Helvetica", "B", 8)
        self.set_y(10)
        self.cell(60, 5, "AIRCRAFT MAINTENANCE MANUAL", 0, 0, "L")
        self.cell(70, 5, f"CHAPTER {self.chapter}", 0, 0, "C")
        self.cell(60, 5, f"Rev. {self.revision}", 0, 1, "R")

        self.set_font("Helvetica", "", 7)
        self.cell(60, 4, "CFM56-5B / AIRBUS A320", 0, 0, "L")
        self.cell(70, 4, f"SECTION {self.section}", 0, 0, "C")
        self.cell(60, 4, f"Date: {self.date}", 0, 1, "R")

        # Line under header
        self.line(10, 20, 200, 20)
        self.ln(8)

    def footer(self):
        self.set_y(-20)
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.3)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "I", 7)
        self.cell(95, 4, "DEMO DOCUMENT - NOT FOR OPERATIONAL USE", 0, 0, "L")
        self.cell(95, 4, f"Page {self.page_no()}/{{nb}}", 0, 0, "R")
        self.ln(4)
        self.set_font("Helvetica", "I", 6)
        self.cell(0, 3, "This document is a fictional mock-up created for the Lore hackathon demo. It does not represent real EASA-approved maintenance data.", 0, 0, "C")

    def add_title_page(self):
        self.add_page()
        self.ln(30)

        # Big title block
        self.set_font("Helvetica", "B", 20)
        self.cell(0, 12, "AIRCRAFT MAINTENANCE MANUAL", 0, 1, "C")
        self.ln(5)

        self.set_font("Helvetica", "B", 14)
        self.cell(0, 8, f"CHAPTER {self.chapter} - ENGINE", 0, 1, "C")
        self.ln(3)

        self.set_font("Helvetica", "B", 16)
        self.multi_cell(0, 8, f"SECTION {self.section}", 0, "C")
        self.ln(2)
        self.multi_cell(0, 8, self.doc_title.upper(), 0, "C")
        self.ln(10)

        # Info box
        self.set_font("Helvetica", "", 10)
        x = 50
        w = 110
        self.set_x(x)
        self.cell(w, 7, f"Engine Type: CFM56-5B", 1, 1, "C")
        self.set_x(x)
        self.cell(w, 7, f"Aircraft: Airbus A320 Family", 1, 1, "C")
        self.set_x(x)
        self.cell(w, 7, f"Revision: {self.revision}", 1, 1, "C")
        self.set_x(x)
        self.cell(w, 7, f"Effective Date: {self.date}", 1, 1, "C")
        self.ln(15)

        # Warning box
        self.set_fill_color(255, 240, 240)
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 7, "WARNING", 1, 1, "C", fill=True)
        self.set_font("Helvetica", "", 9)
        self.multi_cell(0, 5,
            "This document is a FICTIONAL MOCK-UP created for demonstration purposes only. "
            "It does not represent real EASA-approved Aircraft Maintenance Manual data. "
            "Do not use this document for any actual maintenance, repair, or overhaul activity.",
            1, "C", fill=True)

    def section_heading(self, number, title):
        self.set_x(self.l_margin)
        self.ln(4)
        self.set_font("Helvetica", "B", 12)
        self.cell(0, 7, f"{number}. {title.upper()}", 0, 1, "L")
        self.set_draw_color(0, 0, 0)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(3)

    def subsection(self, number, title):
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 6, f"{number} {title}", 0, 1, "L")
        self.ln(1)

    def para(self, text):
        self.set_font("Helvetica", "", 9)
        self.set_x(self.l_margin)
        self.multi_cell(0, 5, text, 0, "L")
        self.ln(1)

    def bullet(self, text, indent=15):
        self.set_font("Helvetica", "", 9)
        left = self.l_margin + indent
        w = self.w - left - self.r_margin
        self.set_x(left)
        self.multi_cell(w, 5, f"- {text}", 0, "L")

    def numbered_step(self, number, text, indent=15):
        self.set_font("Helvetica", "", 9)
        left = self.l_margin + indent
        w = self.w - left - self.r_margin
        self.set_x(left)
        self.multi_cell(w, 5, f"{number}. {text}", 0, "L")

    def table_row(self, cells, widths, bold=False, fill=False):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B" if bold else "", 8)
        if fill:
            self.set_fill_color(230, 230, 230)
        h = 6
        for i, (cell, w) in enumerate(zip(cells, widths)):
            self.cell(w, h, cell, 1, 0, "C", fill=fill)
        self.ln(h)

    def note_box(self, text, label="NOTE"):
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_fill_color(240, 248, 255)
        self.set_font("Helvetica", "B", 8)
        self.cell(0, 5, f"  {label}:", 0, 1, "L", fill=True)
        self.set_font("Helvetica", "I", 8)
        self.multi_cell(0, 4, f"  {text}", 0, "L", fill=True)
        self.ln(2)

    def warning_box(self, text):
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_fill_color(255, 245, 230)
        self.set_font("Helvetica", "B", 8)
        self.cell(0, 5, "  WARNING:", 0, 1, "L", fill=True)
        self.set_font("Helvetica", "", 8)
        self.multi_cell(0, 4, f"  {text}", 0, "L", fill=True)
        self.ln(2)

    def caution_box(self, text):
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_fill_color(255, 255, 230)
        self.set_font("Helvetica", "B", 8)
        self.cell(0, 5, "  CAUTION:", 0, 1, "L", fill=True)
        self.set_font("Helvetica", "", 8)
        self.multi_cell(0, 4, f"  {text}", 0, "L", fill=True)
        self.ln(2)


# ═══════════════════════════════════════════════════════════════
# SOP 1: AMM 72-21-00  -  Fan Vibration Monitoring & Troubleshooting
# ═══════════════════════════════════════════════════════════════

def create_sop_72_21_00():
    pdf = AMMPDF("72", "72-21-00", "CFM56-5B Fan Vibration Monitoring\nand Troubleshooting")
    pdf.alias_nb_pages()
    pdf.add_title_page()

    # Page 2  -  content
    pdf.add_page()

    # Section 1
    pdf.section_heading("1", "Safety Precautions")
    pdf.subsection("1.1", "Pre-Maintenance Safety")
    pdf.para("Before any inspection or maintenance task involving engine rotation, ensure that the engine is safe for maintenance:")
    pdf.bullet("ENGINE MASTER switch is OFF.")
    pdf.bullet("Ignition is OFF.")
    pdf.bullet('A safety tag ("DANGER - DO NOT OPERATE") is installed in the cockpit on the ENGINE MASTER switch.')
    pdf.bullet("Ensure that the intake area is clear of all personnel and loose objects (FOD prevention).")
    pdf.bullet("If engine rotation is required for inspection, ensure all personnel are clear of intake and exhaust hazard areas. Use appropriate communication procedure with cockpit crew.")

    # Section 2
    pdf.section_heading("2", "Vibration Monitoring - General")
    pdf.subsection("2.1", "Monitoring System")
    pdf.para("The engine vibration is monitored by the Engine Vibration Monitoring Unit (EVMU), which provides a readout on the SD (System Display) in the cockpit. Readings are displayed in N1 Vibration Units (NU).")
    pdf.subsection("2.2", "Influencing Factors")
    pdf.para('Vibration levels are influenced by several factors, including engine thrust setting (N1%), ambient temperature, and engine age (e.g., "rubbing" of new seals).')
    pdf.subsection("2.3", "Severity Classification")
    pdf.para("For troubleshooting purposes, vibration severity is classified into three levels:")
    pdf.ln(2)

    widths = [35, 40, 115]
    pdf.table_row(["Severity Level", "N1 Vibration (NU)", "Action Required"], widths, bold=True, fill=True)
    pdf.table_row(["NORMAL", "< 2.0 NU", "No action required. Continuous monitoring by on-board systems."], widths)
    pdf.table_row(["MONITOR", "2.0 - 3.5 NU", "Record reading. Monitor 3 flight cycles. Visual inspection (Sec 3)."], widths)
    pdf.table_row(["ESCALATE", "> 3.5 NU", "Immediate action. Do not dispatch. Detailed inspection (Sec 4)."], widths)

    # Section 3
    pdf.section_heading("3", "Visual Inspection - Fan Section (MONITOR Level)")
    pdf.subsection("3.1", "Scope")
    pdf.para("If a vibration reading in the MONITOR range is detected, perform a general visual inspection of the fan section.")
    pdf.subsection("3.2", "Access")
    pdf.bullet("Ensure engine is safe (Section 1.1).")
    pdf.bullet("Open fan cowl doors.")
    pdf.subsection("3.3", "Inspection Procedure")
    pdf.para("Fan Blades: Visually check each fan blade for:")
    pdf.bullet("Foreign Object Damage (FOD) on leading edges and airfoil surfaces.", 25)
    pdf.bullet("Dents, nicks, or gouges exceeding limits defined in AMM 72-21-11.", 25)
    pdf.bullet("Evidence of balancing weights missing from the spinner or fan disk.", 25)
    pdf.para("Fan Case and Liners: Inspect the acoustic fan case liner for:")
    pdf.bullet("Delamination or missing sections.", 25)
    pdf.bullet("Debris or ice build-up in cold weather conditions.", 25)
    pdf.para("Spinner Cone: Check spinner cone for secure attachment and signs of cracking.")

    pdf.subsection("3.4", "Operational Check")
    pdf.bullet("Perform a ground run at idle and at 80% N1.")
    pdf.bullet("Observe vibration levels at both stabilized conditions.")
    pdf.bullet("A momentary increase in vibration during acceleration/deceleration is acceptable. Stabilized readings are the primary reference.")

    pdf.subsection("3.5", "Special Condition - Cold Weather")
    pdf.note_box(
        "At low ambient temperatures (T < 8 deg C), a temporary increase in N1 vibration up to 2.5 NU may occur "
        "due to fan blade root stiffness changes. If vibration returns to < 2.0 NU after the engine has warmed up "
        "(oil temp > 50 deg C), no further action is required."
    )

    # Section 4
    pdf.section_heading("4", "Troubleshooting and Escalation Procedure (ESCALATE Level)")
    pdf.subsection("4.1", "Trigger Conditions")
    pdf.para("If vibration exceeds 3.5 NU, or if the MONITOR level persists for more than 3 consecutive flight cycles, the following escalation procedure is mandatory:")
    pdf.subsection("4.2", "Perform Trim Balance (Fan)")
    pdf.bullet("A fan trim balance procedure must be performed in accordance with AMM 72-21-00-720-001.")
    pdf.bullet("Use the EVMU balance program to calculate required balance weights and installation angles.")
    pdf.subsection("4.3", "Post-Balance Check")
    pdf.bullet("After balance weight installation, perform a ground run and a check flight (if required by local procedures).")
    pdf.bullet("Vibration levels must be reduced to below 2.0 NU.")
    pdf.subsection("4.4", "If Vibration Persists")
    pdf.para("If vibration remains > 3.5 NU after trim balance, perform a full borescope inspection of the fan and booster (LPC) stages per AMM 72-21-10.")
    pdf.para("Inspect for:")
    pdf.bullet("Blade tip rubs on fan case abradable coating.", 25)
    pdf.bullet("Damage to booster blades.", 25)
    pdf.bullet("Signs of fan disk distortion.", 25)
    pdf.subsection("4.5", "Component Replacement")
    pdf.para("If internal damage is found, contact Engineering for disposition. Engine removal and module change may be required.")

    pdf.output(os.path.join(OUTPUT_DIR, "AMM-72-21-00-Fan-Vibration-Monitoring.pdf"))
    print("  [OK] AMM-72-21-00-Fan-Vibration-Monitoring.pdf")


# ═══════════════════════════════════════════════════════════════
# SOP 2: AMM 72-00-00  -  General Engine Maintenance Procedures
# ═══════════════════════════════════════════════════════════════

def create_sop_72_00_00():
    pdf = AMMPDF("72", "72-00-00", "CFM56-5B Engine\nGeneral Maintenance Procedures")
    pdf.alias_nb_pages()
    pdf.add_title_page()

    pdf.add_page()

    # Section 1
    pdf.section_heading("1", "General")
    pdf.subsection("1.1", "Applicability")
    pdf.para("This section provides general maintenance procedures applicable to the CFM International CFM56-5B series engines installed on Airbus A320 family aircraft (A318/A319/A320/A321).")
    pdf.subsection("1.2", "Engine Identification")
    pdf.para("The CFM56-5B engine is a high-bypass turbofan with the following main modules:")
    pdf.bullet("Fan section (1 fan stage + 4 booster stages)")
    pdf.bullet("High Pressure Compressor (HPC, 9 stages)")
    pdf.bullet("Combustion chamber (annular)")
    pdf.bullet("High Pressure Turbine (HPT, 1 stage)")
    pdf.bullet("Low Pressure Turbine (LPT, 4 stages)")
    pdf.bullet("Accessory Gearbox (AGB)")
    pdf.subsection("1.3", "Reference Documents")
    pdf.para("All maintenance activities must be performed in accordance with the approved AMM chapters. Key references:")
    pdf.bullet("AMM 72-21-00: Fan Vibration Monitoring and Troubleshooting")
    pdf.bullet("AMM 72-21-10: Fan and Booster Borescope Inspection")
    pdf.bullet("AMM 72-21-11: Fan Blade Damage Limits and Repair")
    pdf.bullet("AMM 72-53-00: Engine Oil System Servicing")
    pdf.bullet("AMM 72-00-00-810-001: Engine Preservation and Storage")

    # Section 2
    pdf.section_heading("2", "Safety Precautions")
    pdf.warning_box("ENGINE HAZARD AREAS: The intake danger zone extends 3 metres forward and 120 degrees to each side of the engine centreline at idle thrust. The exhaust danger zone extends 60 metres aft at all thrust levels. These zones must be clear of personnel at all times during engine operation.")
    pdf.subsection("2.1", "General Safety Requirements")
    pdf.numbered_step(1, "Confirm ENGINE MASTER switch is OFF and tagged before any on-wing work.")
    pdf.numbered_step(2, "Confirm ignition systems are OFF.")
    pdf.numbered_step(3, 'Install "DANGER - DO NOT OPERATE" safety tags in the cockpit.')
    pdf.numbered_step(4, "Ensure the aircraft is properly grounded (static discharge).")
    pdf.numbered_step(5, "Ensure adequate lighting in the work area (minimum 500 lux for detailed inspection).")
    pdf.numbered_step(6, "All tools must be accounted for (FOD prevention). Use tool shadow boards where available.")
    pdf.numbered_step(7, "Wear appropriate PPE: hearing protection (>85 dB), safety glasses, gloves as required.")

    pdf.subsection("2.2", "Fire Prevention")
    pdf.bullet("No open flames within 15 metres of the aircraft during fuel or oil servicing.")
    pdf.bullet("Fire extinguisher (dry powder or CO2) must be positioned within 10 metres of the engine.")
    pdf.bullet("Fuel and oil spills must be cleaned immediately using approved absorbent material.")

    # Section 3
    pdf.section_heading("3", "Pre-Flight / Pre-Departure Checks")
    pdf.subsection("3.1", "Engine External Visual Check")
    pdf.para("Before each departure, the following external visual checks must be performed:")
    pdf.numbered_step(1, "Fan section: Check for visible FOD damage, ice accumulation (cold weather), and oil leaks around the fan case split line.")
    pdf.numbered_step(2, "Cowling: Verify all latches are secure. Check for dents, cracks, or missing fasteners.")
    pdf.numbered_step(3, "Exhaust: Check tailpipe for obstructions, bird nests, or visible damage.")
    pdf.numbered_step(4, "Pylons and mounts: Visual check for hydraulic leaks, chafing, or loose connections.")
    pdf.numbered_step(5, "Engine drains: Check mast drain for abnormal fluid discharge (fuel or oil).")
    pdf.note_box("A slight oil film on the mast drain outlet is normal. A steady drip or streak exceeding 50 mm from the drain requires further investigation per AMM 72-53-00.")

    pdf.subsection("3.2", "Cockpit Engine Indications Check (with External Power)")
    pdf.para("With external power applied and engines OFF, verify the following indications:")
    pdf.bullet("N1, N2 gauges indicate zero (or within calibration tolerance).")
    pdf.bullet("EGT gauge indicates ambient temperature (+/- 5 deg C).")
    pdf.bullet("Oil pressure and oil temperature gauges are within normal range.")
    pdf.bullet("ECAM: no engine-related warnings or cautions displayed.")
    pdf.bullet("Vibration display: EVMU shows 0.0 NU (engines static).")

    # Section 4
    pdf.section_heading("4", "Ground Run Procedures")
    pdf.subsection("4.1", "Ground Run Requirements")
    pdf.para("A ground run is required after the following maintenance actions:")
    pdf.bullet("Engine oil servicing (top-up or change)")
    pdf.bullet("Fan trim balance")
    pdf.bullet("Borescope inspection (to verify no tools/FOD left in engine)")
    pdf.bullet("Any maintenance action that breaks the gas path seal")
    pdf.bullet("Engine change or module replacement")

    pdf.subsection("4.2", "Ground Run Procedure")
    pdf.warning_box("Ground runs must only be performed by qualified personnel holding appropriate authorisation. The run area must be clear of FOD, personnel, and equipment. Chocks must be in place and parking brake set.")
    pdf.numbered_step(1, "Position fire crew standby (local procedures apply).")
    pdf.numbered_step(2, "Start engine per AMM 72-00-00-710-001.")
    pdf.numbered_step(3, "Stabilise at idle for minimum 3 minutes. Record N1, N2, EGT, oil pressure, oil temperature, vibration.")
    pdf.numbered_step(4, "Advance to 80% N1. Hold for 30 seconds. Record same parameters.")
    pdf.numbered_step(5, "If required, advance to full rated thrust. Hold for 15 seconds.")
    pdf.numbered_step(6, "Return to idle. Observe parameters for 2 minutes.")
    pdf.numbered_step(7, "Shut down per normal procedure. Observe EGT decay (must reach < 100 deg C within 5 minutes).")

    pdf.subsection("4.3", "Acceptance Criteria")
    widths = [50, 70, 70]
    pdf.table_row(["Parameter", "Idle", "80% N1"], widths, bold=True, fill=True)
    pdf.table_row(["N1 Vibration", "< 2.0 NU", "< 2.0 NU"], widths)
    pdf.table_row(["Oil Pressure", "25-55 PSI", "40-65 PSI"], widths)
    pdf.table_row(["Oil Temperature", "40-130 deg C", "60-145 deg C"], widths)
    pdf.table_row(["EGT", "350-500 deg C", "600-850 deg C"], widths)
    pdf.table_row(["Oil Consumption", "-- ", "< 0.4 qt/hr"], widths)

    # Section 5
    pdf.section_heading("5", "Tool and Equipment Control")
    pdf.subsection("5.1", "FOD Prevention")
    pdf.para("Foreign Object Damage prevention is critical for engine maintenance. The following controls apply:")
    pdf.numbered_step(1, "All tools must be inventoried before and after any engine work using the toolbox checklist.")
    pdf.numbered_step(2, "Personal items (pens, badges, coins, phones) must be secured or removed before entering the engine intake area.")
    pdf.numbered_step(3, "All access panels, blanking caps, and protective covers must be accounted for after maintenance.")
    pdf.numbered_step(4, "If a tool is missing, do NOT close the cowl. Perform a thorough search. If unrecoverable, perform a borescope inspection per AMM 72-21-10.")

    pdf.output(os.path.join(OUTPUT_DIR, "AMM-72-00-00-General-Engine-Maintenance.pdf"))
    print("  [OK] AMM-72-00-00-General-Engine-Maintenance.pdf")


# ═══════════════════════════════════════════════════════════════
# SOP 3: AMM 72-21-10  -  Fan and Booster Borescope Inspection
# ═══════════════════════════════════════════════════════════════

def create_sop_72_21_10():
    pdf = AMMPDF("72", "72-21-10", "CFM56-5B Fan and Booster\nBorescope Inspection")
    pdf.alias_nb_pages()
    pdf.add_title_page()

    pdf.add_page()

    # Section 1
    pdf.section_heading("1", "General")
    pdf.subsection("1.1", "Purpose")
    pdf.para("This section describes the borescope inspection procedure for the fan and low-pressure compressor (booster) stages of the CFM56-5B engine. Borescope inspection allows internal assessment of engine components without disassembly.")
    pdf.subsection("1.2", "When Required")
    pdf.para("A borescope inspection of the fan and booster section is required in the following cases:")
    pdf.bullet("Vibration persists above 3.5 NU after fan trim balance (ref. AMM 72-21-00, Section 4.4)")
    pdf.bullet("Suspected FOD ingestion (bird strike, runway debris)")
    pdf.bullet("After a tool has been reported missing during engine maintenance")
    pdf.bullet("Scheduled interval inspection per Maintenance Planning Document (MPD)")
    pdf.bullet("Post-exceedance inspection (over-temperature, over-speed, or hard landing)")

    # Section 2
    pdf.section_heading("2", "Equipment Required")
    pdf.para("The following equipment is required for this inspection:")
    pdf.bullet("Video borescope with minimum 6 mm probe diameter and 1.5 m working length")
    pdf.bullet("Articulating tip capability (minimum 120-degree deflection)")
    pdf.bullet("Light source: minimum 5000 lumens LED")
    pdf.bullet("Recording capability (video and still image capture)")
    pdf.bullet("Borescope port access tools (plugs, adaptors, torque wrench for port plugs)")
    pdf.bullet("Inspection mirror and magnifying glass (for port area verification)")
    pdf.bullet("Approved cleaning solution and lint-free wipes for port areas")

    # Section 3
    pdf.section_heading("3", "Safety Precautions")
    pdf.warning_box("Engine must be cold (EGT < 50 deg C) and safe for maintenance per AMM 72-00-00 Section 2 before performing borescope inspection.")
    pdf.bullet("Ensure engine is safe for maintenance (Section 1.1 of AMM 72-00-00).")
    pdf.bullet("Do not force the borescope probe. If resistance is felt, withdraw and verify insertion path.")
    pdf.bullet("Record the insertion depth at all times to prevent probe loss inside the engine.")
    pdf.bullet("If the probe tip breaks or separates, STOP immediately. Treat as FOD event. Contact Engineering.")

    # Section 4
    pdf.section_heading("4", "Borescope Port Locations")
    pdf.subsection("4.1", "Fan Section Ports")
    pdf.para("The CFM56-5B has the following borescope access ports for the fan section:")
    widths = [30, 50, 60, 50]
    pdf.table_row(["Port ID", "Location", "View", "Access"], widths, bold=True, fill=True)
    pdf.table_row(["FAN-1", "Fan case, 2 o'clock", "Fan blade tips, abradable", "Fan cowl open"], widths)
    pdf.table_row(["FAN-2", "Fan case, 10 o'clock", "Fan blade tips, leading edge", "Fan cowl open"], widths)
    pdf.table_row(["BST-1", "Booster case, 4 o'clock", "Booster stages 1-2", "Fan cowl open"], widths)
    pdf.table_row(["BST-2", "Booster case, 8 o'clock", "Booster stages 3-4", "Fan cowl open"], widths)

    # Section 5
    pdf.section_heading("5", "Inspection Procedure")
    pdf.subsection("5.1", "Preparation")
    pdf.numbered_step(1, "Ensure engine is safe for maintenance and engine is cold (EGT < 50 deg C).")
    pdf.numbered_step(2, "Open fan cowl doors.")
    pdf.numbered_step(3, "Locate and clean the borescope port area with approved solvent.")
    pdf.numbered_step(4, "Remove borescope port plug. Inspect plug O-ring and replace if damaged.")
    pdf.numbered_step(5, "Set up borescope recording system. Verify image quality before insertion.")

    pdf.subsection("5.2", "Fan Blade Inspection (Ports FAN-1, FAN-2)")
    pdf.numbered_step(1, "Insert borescope probe through FAN-1 port.")
    pdf.numbered_step(2, "Advance probe to view fan blade tip clearance area.")
    pdf.numbered_step(3, "Manually rotate the fan (using fan blade turning tool) to inspect each blade. Record each blade position (numbered 1 through 36).")
    pdf.numbered_step(4, "Inspect each blade for: tip rubs, leading edge erosion, mid-span shroud wear, trailing edge cracks, root fillet cracking.")
    pdf.numbered_step(5, "Inspect the fan case abradable lining for: excessive rub depth (> 1.5 mm), delamination, embedded debris.")
    pdf.numbered_step(6, "Repeat from FAN-2 port to obtain complementary viewing angle.")
    pdf.numbered_step(7, "Record all findings with still images at each blade position.")

    pdf.subsection("5.3", "Booster Stage Inspection (Ports BST-1, BST-2)")
    pdf.numbered_step(1, "Insert borescope through BST-1 port.")
    pdf.numbered_step(2, "Inspect booster blades (stages 1-2) for: leading edge nicks or dents, blade tip curl, foreign object damage, erosion or corrosion.")
    pdf.numbered_step(3, "Advance to BST-2 port for stages 3-4.")
    pdf.numbered_step(4, "Inspect stator vanes for: cracking at root fillets, erosion, corrosion pitting.")
    pdf.numbered_step(5, "Record all findings.")

    pdf.subsection("5.4", "Completion")
    pdf.numbered_step(1, "Withdraw borescope probe. Verify probe tip is intact (compare to pre-insertion photo).")
    pdf.numbered_step(2, "Reinstall borescope port plugs. Torque to 8-12 Nm.")
    pdf.numbered_step(3, "Verify all port plugs are secure and sealed.")
    pdf.numbered_step(4, "Close fan cowl doors.")
    pdf.numbered_step(5, "Document findings in engine logbook with borescope images attached.")

    # Section 6
    pdf.section_heading("6", "Acceptance Criteria")
    pdf.para("The following limits apply for continued service without repair:")
    widths = [55, 65, 70]
    pdf.table_row(["Finding", "Serviceable Limit", "Action if Exceeded"], widths, bold=True, fill=True)
    pdf.table_row(["Fan blade tip rub", "Depth < 1.0 mm", "Blend per AMM 72-21-11"], widths)
    pdf.table_row(["Leading edge nick", "Depth < 2.0 mm, L < 10 mm", "Blend per AMM 72-21-11"], widths)
    pdf.table_row(["Mid-span shroud wear", "< 50% contact face", "Monitor next 500 cycles"], widths)
    pdf.table_row(["Abradable rub depth", "< 1.5 mm", "Contact Engineering"], widths)
    pdf.table_row(["Booster blade nick", "Depth < 0.5 mm", "Blend if accessible"], widths)
    pdf.table_row(["Stator vane crack", "Not acceptable", "Engine removal required"], widths)

    pdf.caution_box("All findings exceeding serviceable limits must be reported to Engineering for disposition before returning the engine to service.")

    pdf.output(os.path.join(OUTPUT_DIR, "AMM-72-21-10-Borescope-Inspection.pdf"))
    print("  [OK] AMM-72-21-10-Borescope-Inspection.pdf")


# ═══════════════════════════════════════════════════════════════
# SOP 4: AMM 72-21-11  -  Fan Blade Damage Limits and Repair
# ═══════════════════════════════════════════════════════════════

def create_sop_72_21_11():
    pdf = AMMPDF("72", "72-21-11", "CFM56-5B Fan Blade\nDamage Limits and Repair (Blending)")
    pdf.alias_nb_pages()
    pdf.add_title_page()

    pdf.add_page()

    # Section 1
    pdf.section_heading("1", "General")
    pdf.subsection("1.1", "Purpose")
    pdf.para("This section defines the allowable damage limits for CFM56-5B fan blades and provides the blending (repair) procedure for damage within serviceable limits. Fan blade blending restores aerodynamic profile and prevents crack propagation from surface damage.")
    pdf.subsection("1.2", "Applicability")
    pdf.para("This procedure applies to all CFM56-5B fan blades (36 blades per engine, titanium alloy Ti-6Al-4V). Blending is an on-wing repair procedure that can be performed without engine removal.")

    # Section 2
    pdf.section_heading("2", "Damage Classification")
    pdf.subsection("2.1", "Types of Damage")
    pdf.para("Fan blade damage is classified into the following categories:")
    pdf.bullet("Nick: A sharp-edged indentation, typically from small FOD impact.")
    pdf.bullet("Dent: A smooth, rounded depression from blunt impact.")
    pdf.bullet("Gouge: A material-removing scratch or groove, usually from metallic FOD.")
    pdf.bullet("Crack: A linear discontinuity with no material removal. NOT blendable.")
    pdf.bullet("Tear: A material separation with deformation. NOT blendable.")
    pdf.bullet("Erosion: Gradual material loss from sand, rain, or volcanic ash exposure.")

    pdf.subsection("2.2", "Damage Zones")
    pdf.para("The fan blade is divided into zones with different damage tolerance:")
    widths = [35, 60, 50, 45]
    pdf.table_row(["Zone", "Location", "Max Nick Depth", "Max Dent Depth"], widths, bold=True, fill=True)
    pdf.table_row(["A (Tip)", "Outer 25% of blade span", "3.0 mm", "5.0 mm"], widths)
    pdf.table_row(["B (Mid)", "25-75% of blade span", "2.0 mm", "3.0 mm"], widths)
    pdf.table_row(["C (Root)", "Inner 25% of blade span", "1.0 mm", "1.5 mm"], widths)
    pdf.table_row(["LE (Leading)", "Leading edge (all spans)", "2.0 mm", "2.5 mm"], widths)
    pdf.table_row(["TE (Trailing)", "Trailing edge (all spans)", "1.5 mm", "2.0 mm"], widths)

    pdf.warning_box("Zone C (root) damage exceeding limits is NOT blendable on-wing. The blade must be removed and sent for shop repair or replaced. Root zone cracking of ANY size requires blade replacement.")

    # Section 3
    pdf.section_heading("3", "Blending Procedure")
    pdf.subsection("3.1", "Tools Required")
    pdf.bullet("Pneumatic die grinder with variable speed (5,000-25,000 RPM)")
    pdf.bullet("Carbide burr set (pointed, flame, and ball shapes, 3 mm and 6 mm shanks)")
    pdf.bullet("Emery cloth (320 and 600 grit)")
    pdf.bullet("Depth gauge (digital caliper, 0.01 mm resolution)")
    pdf.bullet("Magnifying glass (10x)")
    pdf.bullet("Dye penetrant inspection kit (for post-blend crack check)")
    pdf.bullet("Blade profile template (OEM-supplied, P/N CFM-FBT-001)")
    pdf.bullet("Protective blade covers for adjacent blades")

    pdf.subsection("3.2", "Safety Precautions")
    pdf.caution_box("Always wear eye protection and respiratory mask when blending. Titanium dust is a fire hazard - do not allow accumulation. Have a Class D fire extinguisher available.")
    pdf.bullet("Engine must be safe for maintenance per AMM 72-00-00 Section 2.")
    pdf.bullet("Install protective covers on blades adjacent to the blade being blended.")
    pdf.bullet("Do not allow titanium grinding dust to accumulate. Clean continuously.")
    pdf.bullet("Do not exceed material removal limits specified in Section 2.2.")

    pdf.subsection("3.3", "Blending Steps")
    pdf.numbered_step(1, "Identify and mark the damage area. Measure depth and length with calibrated depth gauge. Record measurements.")
    pdf.numbered_step(2, "Determine the zone (A/B/C/LE/TE) and verify damage is within blendable limits.")
    pdf.numbered_step(3, "Using the carbide burr at low speed (5,000-8,000 RPM), remove damaged material with a smooth, saucer-shaped blend. The blend ratio must be 15:1 (length to depth).")
    pdf.numbered_step(4, "Blend must be smooth with no sharp edges, undercuts, or abrupt transitions.")
    pdf.numbered_step(5, "After rough blending, smooth the surface with 320 grit emery cloth, then polish with 600 grit.")
    pdf.numbered_step(6, "Verify blend depth does not exceed zone limits. Check blend profile against template.")
    pdf.numbered_step(7, "Perform dye penetrant inspection on the blended area to confirm no cracks remain.")
    pdf.numbered_step(8, "If cracks are detected after blending, the blade must be replaced. Do not re-blend.")

    pdf.subsection("3.4", "Post-Blend Verification")
    pdf.para("After blending, the following checks are required:")
    pdf.bullet("Blend depth within zone limits (Section 2.2)")
    pdf.bullet("Blend ratio >= 15:1")
    pdf.bullet("Surface finish smooth and free of tool marks")
    pdf.bullet("Dye penetrant inspection: no indications")
    pdf.bullet("Adjacent blades undamaged by blending operation")

    pdf.note_box("After blending a fan blade, a fan trim balance is recommended (AMM 72-21-00, Section 4.2) as material removal may alter the blade mass distribution.")

    # Section 4
    pdf.section_heading("4", "Cumulative Blend Limits")
    pdf.para("Fan blades have cumulative blend limits over their service life. The following limits must not be exceeded:")
    pdf.bullet("Maximum number of blends per blade: 5 in Zone A, 3 in Zone B, 1 in Zone C")
    pdf.bullet("Maximum total material removal per blade: 8.0 mm cumulative depth across all blends")
    pdf.bullet("Leading edge cumulative blend length: must not exceed 30% of blade chord at any span location")

    pdf.caution_box("All blending actions must be recorded in the engine logbook and the blade history card. Failure to track cumulative blends may result in a blade exceeding safe service limits.")

    pdf.output(os.path.join(OUTPUT_DIR, "AMM-72-21-11-Fan-Blade-Damage-Limits.pdf"))
    print("  [OK] AMM-72-21-11-Fan-Blade-Damage-Limits.pdf")


# ═══════════════════════════════════════════════════════════════
# SOP 5: AMM 72-53-00  -  Engine Oil System Servicing
# ═══════════════════════════════════════════════════════════════

def create_sop_72_53_00():
    pdf = AMMPDF("72", "72-53-00", "CFM56-5B Engine Oil System\nServicing and Monitoring")
    pdf.alias_nb_pages()
    pdf.add_title_page()

    pdf.add_page()

    # Section 1
    pdf.section_heading("1", "General")
    pdf.subsection("1.1", "Oil System Description")
    pdf.para("The CFM56-5B engine oil system is a self-contained, pressure-fed recirculating system. It provides lubrication and cooling to the main bearings (#1 through #5), accessory gearbox, and integrated drive generator (IDG).")
    pdf.subsection("1.2", "Approved Oil Types")
    pdf.para("Only the following approved oil types may be used:")
    pdf.bullet("MIL-PRF-23699 (standard synthetic turbine oil)")
    pdf.bullet("MIL-PRF-7808 (low-temperature variant, approved for ambient T < -40 deg C)")
    pdf.caution_box("Do not mix oil types. If oil type change is required, a full oil system flush must be performed per AMM 72-53-00-420-001.")
    pdf.subsection("1.3", "Oil Tank Capacity")
    pdf.para("Oil tank usable capacity: 12.5 US quarts. Minimum dispatch quantity: 8.0 US quarts. Normal operating range: 9.0 - 11.5 US quarts.")

    # Section 2
    pdf.section_heading("2", "Oil Level Check and Servicing")
    pdf.subsection("2.1", "When to Check")
    pdf.para("Engine oil level must be checked:")
    pdf.bullet("Before first flight of the day")
    pdf.bullet("At every transit stop exceeding 45 minutes")
    pdf.bullet("After any engine maintenance that opens the oil system")
    pdf.bullet("When the ECAM OIL QTY advisory is displayed")
    pdf.note_box("Oil level must be checked with the engine cold (minimum 15 minutes after shutdown). Hot oil gives a falsely high reading due to thermal expansion and scavenge oil in the tank.")

    pdf.subsection("2.2", "Oil Level Check Procedure")
    pdf.numbered_step(1, "Ensure engine has been shut down for minimum 15 minutes.")
    pdf.numbered_step(2, "Open fan cowl doors to access the oil tank filler port (right-hand side, 2 o'clock position).")
    pdf.numbered_step(3, "Clean the area around the filler cap to prevent contamination.")
    pdf.numbered_step(4, "Remove the filler cap. Extract the dipstick and wipe clean.")
    pdf.numbered_step(5, "Reinsert dipstick fully and withdraw. Read oil level against the graduated markings.")
    pdf.numbered_step(6, "Oil level must be between MIN (8.0 qt) and MAX (12.5 qt) marks.")
    pdf.numbered_step(7, "If below MIN + 1.0 qt (9.0 qt), add approved oil to bring level to 10.5-11.0 qt.")

    pdf.subsection("2.3", "Oil Servicing (Top-Up)")
    pdf.numbered_step(1, "Use only approved oil (Section 1.2). Verify can seal is intact.")
    pdf.numbered_step(2, "Add oil slowly through the filler port. Do not overfill.")
    pdf.numbered_step(3, "After adding oil, recheck level with dipstick.")
    pdf.numbered_step(4, "Secure filler cap. Verify cap is locked (safety wire intact).")
    pdf.numbered_step(5, "Record oil quantity added in the engine logbook. Note the oil type and batch number.")
    pdf.caution_box("Overfilling the oil tank can cause oil to enter the breather system, resulting in visible exhaust smoke and potential cabin air contamination. Do not exceed MAX mark.")

    # Section 3
    pdf.section_heading("3", "Oil Consumption Monitoring")
    pdf.subsection("3.1", "Normal Consumption")
    pdf.para("Normal oil consumption for the CFM56-5B is 0.10 - 0.30 US quarts per flight hour. Consumption varies with engine age, operating conditions, and thrust setting profiles.")
    pdf.subsection("3.2", "Consumption Limits")
    widths = [50, 50, 90]
    pdf.table_row(["Consumption Rate", "Classification", "Action"], widths, bold=True, fill=True)
    pdf.table_row(["< 0.30 qt/hr", "NORMAL", "No action. Record in trend log."], widths)
    pdf.table_row(["0.30 - 0.50 qt/hr", "ELEVATED", "Increase monitoring to every flight. Check for leaks."], widths)
    pdf.table_row(["> 0.50 qt/hr", "EXCESSIVE", "Do not dispatch. Investigate per Section 4."], widths)

    pdf.subsection("3.3", "Trend Monitoring")
    pdf.para("Oil consumption must be tracked over a rolling 50 flight-hour window. A sudden increase of more than 0.10 qt/hr from the established baseline requires investigation, even if the absolute rate is within NORMAL range.")
    pdf.note_box("Engine oil consumption typically increases gradually over the engine's service life. A new or recently overhauled engine may consume 0.05-0.15 qt/hr, while a high-cycle engine may consume 0.20-0.30 qt/hr. A sudden step change is more significant than the absolute value.")

    # Section 4
    pdf.section_heading("4", "Oil Leak Investigation")
    pdf.subsection("4.1", "External Leak Check")
    pdf.para("If elevated or excessive oil consumption is detected, perform a systematic external leak check:")
    pdf.numbered_step(1, "With engine cold and cowls open, inspect all external oil lines, fittings, and connections for wetness or staining.")
    pdf.numbered_step(2, "Key areas to inspect: oil tank filler cap and seal, oil filter housing and bowl, external oil lines (supply and return), AGB oil seal area, IDG oil connections, main bearing sump drain plugs.")
    pdf.numbered_step(3, "If an external leak is found, repair or replace the leaking component.")
    pdf.numbered_step(4, "If no external leak is found, the oil may be consumed internally through bearing seals. Proceed to Section 4.2.")

    pdf.subsection("4.2", "Internal Consumption Investigation")
    pdf.para("Internal oil consumption is indicated by:")
    pdf.bullet("Blue or white exhaust smoke at engine start or during operation")
    pdf.bullet("Oil odour in the cabin or cockpit bleed air")
    pdf.bullet("Oil residue on the tailpipe interior")
    pdf.bullet("Magnetic chip detector indications")
    pdf.para("If internal consumption is suspected, contact Engineering for disposition. Bearing seal replacement may require engine removal.")

    # Section 5
    pdf.section_heading("5", "Oil Filter and Chip Detector Check")
    pdf.subsection("5.1", "Oil Filter Replacement Interval")
    pdf.para("The main oil filter must be replaced at intervals not exceeding 600 flight hours or at each C-check, whichever occurs first.")
    pdf.subsection("5.2", "Oil Filter Inspection")
    pdf.numbered_step(1, "Remove main oil filter bowl. Capture oil in a clean container.")
    pdf.numbered_step(2, "Remove the filter element. Inspect the element for:")
    pdf.bullet("Metallic particles (indicates bearing or gear wear)", 25)
    pdf.bullet("Non-metallic debris (indicates seal degradation)", 25)
    pdf.bullet("Excessive contamination (dark, thick residue)", 25)
    pdf.numbered_step(3, "If metallic particles are found, perform a particle analysis. Contact Engineering with results.")
    pdf.numbered_step(4, "Install new filter element. Verify correct part number. Torque filter bowl to specification.")
    pdf.numbered_step(5, "Perform a ground run to verify no leaks and oil pressure is within limits.")

    pdf.subsection("5.3", "Magnetic Chip Detector")
    pdf.para("The engine has magnetic chip detectors at each main bearing sump. Check chip detectors at each oil filter change or when ECAM CHIP DET warning is displayed.")
    pdf.bullet("Fine fuzz (< 1 mm particles): Clean and reinstall. Monitor.")
    pdf.bullet("Flakes or chips (> 1 mm): Contact Engineering. May indicate bearing distress.")
    pdf.bullet("Repeated chip detector indications within 50 FH: Engine removal for inspection.")

    pdf.output(os.path.join(OUTPUT_DIR, "AMM-72-53-00-Oil-System-Servicing.pdf"))
    print("  [OK] AMM-72-53-00-Oil-System-Servicing.pdf")


# ═══════════════════════════════════════════════════════════════
# SOP 6: AMM 72-00-00-810-001  -  Cold Weather Engine Operations
# ═══════════════════════════════════════════════════════════════

def create_sop_cold_weather():
    pdf = AMMPDF("72", "72-00-00-810-001", "CFM56-5B Cold Weather\nEngine Operations and Precautions")
    pdf.alias_nb_pages()
    pdf.add_title_page()

    pdf.add_page()

    # Section 1
    pdf.section_heading("1", "General")
    pdf.subsection("1.1", "Purpose")
    pdf.para("This section provides specific procedures and precautions for CFM56-5B engine maintenance and operations in cold weather conditions. Cold weather is defined as ambient temperature below 8 deg C (46 deg F) for the purpose of this document.")
    pdf.subsection("1.2", "Scope")
    pdf.para("Cold weather conditions affect multiple engine systems and parameters. Technicians must be aware of expected behavioural changes to avoid unnecessary maintenance actions or false diagnoses.")

    # Section 2
    pdf.section_heading("2", "Known Cold Weather Effects on Engine Parameters")
    pdf.subsection("2.1", "N1 Vibration")
    pdf.para("At ambient temperatures below 8 deg C, the following effects on N1 vibration are expected and considered NORMAL:")
    pdf.bullet("A temporary increase in N1 vibration of up to 0.5 NU above the warm-weather baseline for the specific engine serial number.")
    pdf.bullet("Vibration may read 2.0-2.5 NU on engines that normally read 1.5-2.0 NU in warm conditions.")
    pdf.bullet("This is caused by differential thermal contraction of the titanium fan blades and the steel fan disk, which slightly changes the blade seating angle.")
    pdf.note_box("CRITICAL: This cold-weather vibration increase is a known characteristic, not a defect. If the vibration returns to normal (< 2.0 NU) after engine warm-up (oil temperature > 50 deg C), no maintenance action is required. Do NOT initiate a fan trim balance or escalation procedure for cold-weather vibration alone.")
    pdf.para("Trigger for further action: If N1 vibration exceeds 2.5 NU in cold conditions, OR if vibration does NOT return to baseline after warm-up, follow the standard troubleshooting procedure in AMM 72-21-00.")

    pdf.subsection("2.2", "Engine Start Behaviour")
    pdf.para("Cold weather affects engine start characteristics:")
    pdf.bullet("N2 acceleration may be slower due to increased oil viscosity. Allow up to 90 seconds for N2 stabilisation (vs. 60 seconds in warm weather).")
    pdf.bullet("EGT during start may be 20-40 deg C higher than warm-weather starts. This is expected and within limits as long as the start EGT does not exceed the red line (725 deg C).")
    pdf.bullet("Oil pressure may read higher than normal at initial start due to cold oil viscosity. Allow oil temperature to reach > 40 deg C before comparing to normal operating limits.")

    pdf.subsection("2.3", "Ice Formation")
    pdf.para("Ice can form on engine components in the following conditions:")
    pdf.bullet("Ambient temperature 0 to 10 deg C with visible moisture (rain, fog, mist)")
    pdf.bullet("Overnight with temperature dropping below 0 deg C (frost formation)")
    pdf.bullet("Static aircraft exposed to freezing precipitation")
    pdf.warning_box("Ice ingestion can cause fan blade FOD, booster blade damage, and compressor stall. Always inspect the fan section for ice before engine start in cold/wet conditions.")

    # Section 3
    pdf.section_heading("3", "Pre-Start Inspection in Cold Weather")
    pdf.subsection("3.1", "Additional Cold Weather Checks")
    pdf.para("In addition to the standard pre-departure checks (AMM 72-00-00, Section 3), perform the following in cold weather:")
    pdf.numbered_step(1, "Fan section ice inspection: Use a flashlight to inspect the fan blades, spinner, and fan case inlet for ice or frost accumulation.")
    pdf.numbered_step(2, "If ice is present on fan blades: de-ice using approved heated air equipment or wait for natural thaw. Do NOT chip ice manually  -  risk of blade surface damage.")
    pdf.numbered_step(3, "Check engine intake area for ice-covered FOD (stones, ramp debris frozen to the surface).")
    pdf.numbered_step(4, "Verify engine anti-ice system is functional (cockpit check: ENG ANTI ICE valve position confirmed OPEN when selected).")
    pdf.numbered_step(5, "Check oil level per AMM 72-53-00. Note: cold oil may appear slightly above normal level on dipstick due to thermal contraction. This is expected.")

    pdf.subsection("3.2", "Engine Anti-Ice Operation")
    pdf.para("The engine anti-ice system heats the fan case inlet cowl and nose cone using compressor bleed air:")
    pdf.bullet("Activate engine anti-ice when OAT is below 10 deg C and visible moisture is present.")
    pdf.bullet("Engine anti-ice must be ON during ground operations if icing conditions exist (OAT < 10 deg C + visible moisture, standing water, or snow/slush on taxiway).")
    pdf.bullet("Engine anti-ice ON reduces available thrust by approximately 2-3%. This is normal and accounted for in performance calculations.")
    pdf.caution_box("Do not operate engine anti-ice on the ground for extended periods (> 10 minutes) with engines at idle. This can cause thermal stress to the inlet cowl. If ground hold exceeds 10 minutes in icing conditions, increase thrust to 50% N1 periodically (30 seconds every 5 minutes) to maintain airflow.")

    # Section 4
    pdf.section_heading("4", "Cold Weather Ground Run Adjustments")
    pdf.subsection("4.1", "Modified Acceptance Criteria")
    pdf.para("When performing engine ground runs at ambient temperatures below 8 deg C, the following adjusted acceptance criteria apply:")
    widths = [50, 45, 45, 50]
    pdf.table_row(["Parameter", "Standard Limit", "Cold Wx Limit", "Notes"], widths, bold=True, fill=True)
    pdf.table_row(["N1 Vibration", "< 2.0 NU", "< 2.5 NU", "Must return <2.0 after warm-up"], widths)
    pdf.table_row(["Oil Pressure", "25-55 PSI", "30-70 PSI", "Higher at cold oil temp"], widths)
    pdf.table_row(["Oil Temp (idle)", "40-130 C", "Allow >15 min", "Extended warm-up needed"], widths)
    pdf.table_row(["Start EGT", "< 725 C", "< 725 C (same)", "May read 20-40 C higher"], widths)

    pdf.subsection("4.2", "Extended Warm-Up Procedure")
    pdf.para("In cold weather (ambient < 8 deg C), an extended warm-up procedure is recommended before evaluating engine parameters:")
    pdf.numbered_step(1, "Start engine per standard procedure.")
    pdf.numbered_step(2, "Maintain idle for minimum 5 minutes (vs. 3 minutes standard).")
    pdf.numbered_step(3, "Monitor oil temperature. Do not advance above idle until oil temp > 40 deg C.")
    pdf.numbered_step(4, "Once oil temp > 50 deg C, parameters may be compared to standard acceptance criteria.")
    pdf.numbered_step(5, "Record all cold-weather parameter readings separately in the engine logbook with ambient temperature noted.")

    # Section 5
    pdf.section_heading("5", "Cold Weather Overnight Parking")
    pdf.subsection("5.1", "Engine Preservation")
    pdf.para("For aircraft parked overnight in freezing conditions:")
    pdf.bullet("Install engine inlet and exhaust covers (blanking plugs) to prevent moisture ingress and frost formation on internal components.")
    pdf.bullet("If inlet covers are not available, perform a fan rotation check (minimum 5 manual fan blade turns) before start to verify fan rotates freely and no ice bonding has occurred.")
    pdf.bullet("In extreme cold (below -20 deg C), consider pre-heating the engine oil using external heating equipment before start, if available.")
    pdf.note_box("Engine inlet covers must be removed and accounted for before engine start. Inlet cover left installed during engine start is a serious FOD / engine damage risk. Use the checklist.")

    pdf.output(os.path.join(OUTPUT_DIR, "AMM-72-00-00-810-001-Cold-Weather-Operations.pdf"))
    print("  [OK] AMM-72-00-00-810-001-Cold-Weather-Operations.pdf")


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("Generating Lore Demo SOP PDFs...")
    print(f"Output directory: {OUTPUT_DIR}\n")
    create_sop_72_00_00()
    create_sop_72_21_00()
    create_sop_72_21_10()
    create_sop_72_21_11()
    create_sop_72_53_00()
    create_sop_cold_weather()
    print(f"\nDone. 6 PDFs generated in {OUTPUT_DIR}")
