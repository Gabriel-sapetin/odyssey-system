from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(r"D:\odyssey-system")
TMP = ROOT / "tmp" / "se-doc"
FIG = TMP / "odyssey_figures"
OUT = ROOT / "output" / "Odyssey_SE_Documentation_Chapters_1-5_Final.docx"
FIG.mkdir(parents=True, exist_ok=True)

ORANGE = "ED7D31"
NAVY = "203864"
BLUE = "5B9BD5"
PALE = "EAF2F8"
GRAY = "F3F4F6"
INK = "222222"
WHITE = "FFFFFF"
FONT_PATH = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"

def font(size=24, bold=False):
    p = FONT_BOLD if bold else FONT_PATH
    try:
        return ImageFont.truetype(p, size)
    except OSError:
        return ImageFont.load_default()

def wrap(draw, text, f, maxw):
    lines=[]
    for para in text.split("\n"):
        words=para.split()
        line=""
        for word in words:
            test=(line+" "+word).strip()
            if draw.textbbox((0,0),test,font=f)[2] <= maxw:
                line=test
            else:
                if line: lines.append(line)
                line=word
        if line: lines.append(line)
    return lines

def box(draw, xy, title, body="", fill=PALE, outline=NAVY, title_size=25, body_size=19, radius=18):
    x1,y1,x2,y2=xy
    draw.rounded_rectangle(xy,radius=radius,fill="#"+fill,outline="#"+outline,width=3)
    tf=font(title_size,True); bf=font(body_size)
    lines=wrap(draw,title,tf,x2-x1-28)
    y=y1+14
    for line in lines:
        bb=draw.textbbox((0,0),line,font=tf)
        draw.text(((x1+x2-(bb[2]-bb[0]))/2,y),line,font=tf,fill="#"+NAVY)
        y+=bb[3]-bb[1]+3
    if body:
        y+=5
        for line in wrap(draw,body,bf,x2-x1-30):
            bb=draw.textbbox((0,0),line,font=bf)
            draw.text(((x1+x2-(bb[2]-bb[0]))/2,y),line,font=bf,fill="#"+INK)
            y+=bb[3]-bb[1]+4

def arrow(draw, start, end, color=ORANGE, width=5):
    draw.line([start,end],fill="#"+color,width=width)
    import math
    ang=math.atan2(end[1]-start[1],end[0]-start[0]); n=17
    pts=[end,(end[0]-n*math.cos(ang-.45),end[1]-n*math.sin(ang-.45)),(end[0]-n*math.cos(ang+.45),end[1]-n*math.sin(ang+.45))]
    draw.polygon(pts,fill="#"+color)

def save(name, drawfn, size=(1600,700)):
    im=Image.new("RGB",size,"white"); d=ImageDraw.Draw(im)
    drawfn(d,size)
    path=FIG/(name+".png"); im.save(path,dpi=(200,200)); return path

def make_diagrams():
    def ipo(d,s):
        w,h=s; cols=[(35,80,500,630),(585,80,1015,630),(1100,80,1565,630)]
        titles=["INPUT","PROCESS","OUTPUT"]
        bodies=["• Learner and instructor accounts\n• Course and lesson content\n• Simulation choices and inputs\n• Quiz and flashcard material\n• Classroom and assignment data\n• Profile and progress records",
                "• Present guided lessons\n• Run interactive OS simulations\n• Generate study aids with AI\n• Deliver quizzes and flashcards\n• Record progress and achievements\n• Support classroom workflows",
                "• Accessible, expandable learning\n  platform\n• Visible simulation traces\n• Practice and study feedback\n• Learner progress summaries\n• Instructor-managed activities\n• Administrative oversight"]
        for i,xy in enumerate(cols):
            box(d,xy,titles[i],bodies[i],fill="F4F8FC",title_size=30,body_size=21)
        arrow(d,(510,350),(570,350)); arrow(d,(1025,350),(1085,350))
    def cases(d,s):
        box(d,(600,35,1030,665),"ODYSSEY LEARNING PLATFORM","",fill="FFFFFF",title_size=27)
        actors=[(55,105,"Learner"),(55,310,"Instructor"),(55,515,"Administrator")]
        for x,y,t in actors:
            d.ellipse((x,y,x+42,y+42),outline="#"+NAVY,width=4); d.line((x+21,y+42,x+21,y+102),fill="#"+NAVY,width=4); d.line((x-5,y+65,x+47,y+65),fill="#"+NAVY,width=4); d.line((x+21,y+102,x-1,y+137),fill="#"+NAVY,width=4); d.line((x+21,y+102,x+43,y+137),fill="#"+NAVY,width=4); d.text((x-18,y+145),t,font=font(22,True),fill="#"+INK)
        items=[(655,120,"Study lessons and run labs"),(655,245,"Take quizzes and use study aids"),(655,370,"Review profile and progress"),(655,495,"Manage classrooms and quizzes"),(655,590,"Manage users and platform")]
        for x,y,t in items: box(d,(x,y,x+330,y+72),t,fill="F4F8FC",title_size=23)
        for y in [156,281,406]: arrow(d,(100,180),(645,y),color=BLUE,width=3)
        arrow(d,(100,385),(645,530),color=BLUE,width=3); arrow(d,(100,590),(645,625),color=BLUE,width=3)
    def architecture(d,s):
        rows=[(35,55,1565,165,"PRESENTATION LAYER","Browser or installable PWA | HTML, CSS, JavaScript | Lessons, simulations, profiles, classrooms"),(35,210,1565,320,"APPLICATION AND API LAYER","FastAPI routes | Authentication and role checks | Middleware | Classroom, progress, AI, administration"),(35,365,1565,475,"DATA AND IDENTITY LAYER","Supabase Auth | PostgreSQL | Row Level Security | Application records"),(35,520,1565,630,"EXTERNAL SERVICES AND CLIENT STORAGE","AI provider through backend | Browser local storage | Service worker cache for app shell and static assets")]
        for i,(x1,y1,x2,y2,t,b) in enumerate(rows): box(d,(x1,y1,x2,y2),t,b,fill=["EAF2F8","F4F8FC","EAF2F8","F4F8FC"][i],title_size=25,body_size=23)
        for y in [170,325,480]: arrow(d,(800,y+5),(800,y+36))
    def agile(d,s):
        items=[("PLAN","Select requirements\nand iteration goals"),("DESIGN","Model workflows\nand interfaces"),("BUILD","Implement client,\nAPI, and data work"),("TEST","Check behavior,\nsecurity, and compatibility"),("REVIEW","Inspect outcomes\nand refine backlog")]
        xs=[30,350,670,990,1310]
        for i,(t,b) in enumerate(items):
            box(d,(xs[i],220,xs[i]+260,470),t,b,fill="F4F8FC",title_size=28,body_size=23)
            if i<4: arrow(d,(xs[i]+268,345),(xs[i+1]-10,345))
        d.arc((140,70,1470,625),190,350,fill="#"+ORANGE,width=5)
        arrow(d,(1450,315),(1400,220),color=ORANGE,width=4)
        d.text((500,80),"ITERATIVE DEVELOPMENT WITH CONTINUOUS REVIEW",font=font(27,True),fill="#"+NAVY)
    def activity(d,s):
        nodes=[("Open Explore Lessons",(530,40,1070,110)),("Choose a module or topic",(530,145,1070,215)),("Read lesson content",(530,250,1070,320)),("Practice?",(530,355,1070,425)),("Run simulation or quiz",(140,470,650,550)),("Review explanation",(950,470,1460,550)),("Mark topic complete",(530,585,1070,650))]
        for t,xy in nodes: box(d,xy,t,fill="F4F8FC",title_size=23)
        arrow(d,(800,112),(800,137)); arrow(d,(800,217),(800,242)); arrow(d,(800,322),(800,347)); arrow(d,(650,390),(420,462)); arrow(d,(950,390),(1200,462)); arrow(d,(650,510),(650,578)); arrow(d,(950,510),(950,578)); arrow(d,(650,620),(525,620)); arrow(d,(950,620),(1075,620))
        d.text((290,400),"Yes",font=font(19,True),fill="#"+ORANGE); d.text((1110,400),"No",font=font(19,True),fill="#"+ORANGE)
    def sequence(d,s):
        actors=[("Learner",170),("Browser",525),("FastAPI",920),("Supabase",1330)]
        for label,x in actors:
            box(d,(x-90,35,x+90,105),label,fill="EAF2F8",title_size=23)
            d.line((x,105,x,650),fill="#9AA6B2",width=2)
        msgs=[(150,525,165,"1. Complete lesson"),(525,920,270,"2. Send protected progress request"),(920,1330,375,"3. Validate token and store progress"),(1330,920,480,"4. Return accepted response"),(920,525,555,"5. Return progress status"),(525,170,620,"6. Show confirmation")]
        for x1,x2,y,t in msgs:
            arrow(d,(x1,y),(x2,y),color=BLUE,width=3)
            d.text(((x1+x2)//2-120,y-28),t,font=font(19),fill="#"+INK)
    def erd(d,s):
        entities=[((40,75,430,300),"USER PROFILE","user_id (PK, Auth UUID)\nname, role, avatar\nXP, streak, badges\ncompleted modules"),((610,50,1000,245),"CLASSROOM","classroom_id (PK)\nowner_id (FK)\ntitle, description"),((1160,60,1550,245),"CLASSROOM MEMBERSHIP","membership_id (PK)\nclassroom_id (FK)\nuser_id (FK), role"),((570,390,990,660),"CLASSROOM MODULE","module_id (PK)\nclassroom_id (FK)\ntitle, content, order"),((1110,390,1540,660),"CLASSROOM QUIZ","quiz_id (PK)\nclassroom_id (FK)\nquestions, settings\nsubmissions / scores")]
        for xy,t,b in entities:
            x1,y1,x2,y2=xy; d.rectangle(xy,fill="#FFFFFF",outline="#"+NAVY,width=3); d.rectangle((x1,y1,x2,y1+50),fill="#"+PALE,outline="#"+NAVY,width=2); d.text((x1+12,y1+13),t,font=font(20,True),fill="#"+NAVY)
            yy=y1+68
            for line in b.split("\n"): d.text((x1+15,yy),line,font=font(21),fill="#"+INK); yy+=34
        arrow(d,(435,155),(600,135),color=ORANGE,width=3); arrow(d,(1005,140),(1150,140),color=ORANGE,width=3); arrow(d,(800,255),(800,380),color=ORANGE,width=3); arrow(d,(1010,170),(1210,380),color=ORANGE,width=3)
        d.text((450,110),"owns",font=font(17,True),fill="#"+ORANGE); d.text((1020,112),"has members",font=font(17,True),fill="#"+ORANGE); d.text((815,305),"contains",font=font(17,True),fill="#"+ORANGE)
    def deploy(d,s):
        groups=[((30,100,480,600),"LEARNER / INSTRUCTOR / ADMIN","Web browser or installed PWA\nHTTPS requests\nService worker caches app shell"),((575,100,1025,600),"HOSTED APPLICATION","Vercel static frontend\nRender FastAPI service\nRole-aware API and middleware"),((1120,40,1570,290),"DATA SERVICES","Supabase Auth\nPostgreSQL and RLS"),((1120,410,1570,660),"AI SERVICE","External AI provider\nCalled by FastAPI only\nCredentials kept server side")]
        for xy,t,b in groups: box(d,xy,t,b,fill="F4F8FC",title_size=23,body_size=23)
        arrow(d,(490,330),(560,330)); arrow(d,(1035,235),(1105,175)); arrow(d,(1035,445),(1105,535))
    return [
        ("use-case",cases,(1600,700)),("ipo-model",ipo,(1600,700)),
        ("agile-cycle",agile,(1600,700)),("activity",activity,(1600,700)),
        ("sequence",sequence,(1600,700)),("conceptual-erd",erd,(1600,700)),
        ("architecture",architecture,(1600,700)),("deployment",deploy,(1600,700))]

def set_cell_shading(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)

def set_cell_margins(cell, top=100, start=110, bottom=100, end=110):
    tc=cell._tc; tcPr=tc.get_or_add_tcPr(); mar=OxmlElement('w:tcMar')
    for m,v in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        node=OxmlElement('w:'+m); node.set(qn('w:w'),str(v)); node.set(qn('w:type'),'dxa'); mar.append(node)
    tcPr.append(mar)

def border_paragraph(p, color=ORANGE, size=14):
    pPr=p._p.get_or_add_pPr(); borders=OxmlElement('w:pBdr'); b=OxmlElement('w:top'); b.set(qn('w:val'),'single'); b.set(qn('w:sz'),str(size)); b.set(qn('w:space'),'5'); b.set(qn('w:color'),color); borders.append(b); pPr.append(borders)

def set_page_border(section):
    sectPr=section._sectPr; pg=OxmlElement('w:pgBorders'); pg.set(qn('w:offsetFrom'),'page'); pg.set(qn('w:display'),'allPages'); pg.set(qn('w:zOrder'),'front')
    for side in ('top','left','bottom','right'):
        el=OxmlElement('w:'+side); el.set(qn('w:val'),'triple'); el.set(qn('w:sz'),'8'); el.set(qn('w:space'),'20'); el.set(qn('w:color'),ORANGE); pg.append(el)
    sectPr.append(pg)

def page_field(p):
    r=p.add_run(); begin=OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'),'begin'); instr=OxmlElement('w:instrText'); instr.set(qn('xml:space'),'preserve'); instr.text=' PAGE '; sep=OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'),'separate'); text=OxmlElement('w:t'); text.text='1'; end=OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'),'end')
    for e in (begin,instr,sep,text,end): r._r.append(e)

def add_page_num_restart(section):
    sectPr=section._sectPr; el=OxmlElement('w:pgNumType'); el.set(qn('w:start'),'1'); sectPr.append(el)

def setup_styles(doc):
    styles=doc.styles
    normal=styles['Normal']; normal.font.name='Times New Roman'; normal.font.size=Pt(12); normal.font.color.rgb=RGBColor.from_string(INK)
    normal._element.rPr.rFonts.set(qn('w:eastAsia'),'Times New Roman')
    normal.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY; normal.paragraph_format.first_line_indent=Inches(.5); normal.paragraph_format.line_spacing=1.5; normal.paragraph_format.space_after=Pt(0)
    for nm,size in [('Heading 1',15),('Heading 2',13),('Heading 3',12)]:
        st=styles[nm]; st.font.name='Times New Roman'; st.font.size=Pt(size); st.font.bold=True; st.font.color.rgb=RGBColor.from_string('000000'); st._element.rPr.rFonts.set(qn('w:eastAsia'),'Times New Roman'); st.paragraph_format.keep_with_next=True; st.paragraph_format.first_line_indent=Inches(0); st.paragraph_format.line_spacing=1.0; st.paragraph_format.space_before=Pt(12 if nm!='Heading 1' else 18); st.paragraph_format.space_after=Pt(6)

def add_body(doc,text):
    p=doc.add_paragraph(text); p.paragraph_format.widow_control=True; return p

def add_bullet(doc,text,level=0):
    p=doc.add_paragraph(style='List Bullet' if level==0 else 'List Bullet 2'); p.paragraph_format.left_indent=Inches(.5+level*.25); p.paragraph_format.first_line_indent=Inches(-.22); p.paragraph_format.line_spacing=1.15; p.paragraph_format.space_after=Pt(3); p.add_run(text); return p

def add_table(doc,headers,rows,widths=None):
    t=doc.add_table(rows=1,cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.style='Table Grid'; t.autofit=False
    header_props=t.rows[0]._tr.get_or_add_trPr(); repeat=OxmlElement('w:tblHeader'); repeat.set(qn('w:val'),'true'); header_props.append(repeat); header_props.append(OxmlElement('w:cantSplit'))
    for j,h in enumerate(headers):
        c=t.rows[0].cells[j]; c.text=h; set_cell_shading(c,NAVY); set_cell_margins(c); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for p in c.paragraphs:
            p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs: r.bold=True; r.font.color.rgb=RGBColor(255,255,255); r.font.name='Times New Roman'; r.font.size=Pt(10)
    for i,row in enumerate(rows):
        cells=t.add_row().cells
        cells_row_pr=t.rows[-1]._tr.get_or_add_trPr(); cells_row_pr.append(OxmlElement('w:cantSplit'))
        for j,val in enumerate(row):
            cells[j].text=str(val); set_cell_margins(cells[j]); cells[j].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if i%2==1: set_cell_shading(cells[j],'F4F7FA')
            for p in cells[j].paragraphs:
                p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.line_spacing=1.0; p.paragraph_format.space_after=Pt(0); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs: r.font.name='Times New Roman'; r.font.size=Pt(9)
    if widths:
        for row in t.rows:
            for j,w in enumerate(widths): row.cells[j].width=Inches(w)
    doc.add_paragraph().paragraph_format.space_after=Pt(0)
    return t

def add_figure(doc,path,caption,width=6.1):
    p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.keep_together=True; p.paragraph_format.keep_with_next=True; p.add_run().add_picture(str(path),width=Inches(width))
    c=doc.add_paragraph(caption); c.alignment=WD_ALIGN_PARAGRAPH.CENTER; c.paragraph_format.first_line_indent=Inches(0); c.paragraph_format.keep_with_next=True; c.paragraph_format.space_after=Pt(5)
    for r in c.runs: r.font.name='Times New Roman'; r.font.size=Pt(10)

def chapter(doc,num,title):
    if num > 1: doc.add_page_break()
    for text in (f'Chapter {num}',title.upper()):
        p=doc.add_paragraph(text); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.space_after=Pt(8); p.paragraph_format.keep_with_next=True
        for r in p.runs: r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(14)

def section(doc,title,level=2): doc.add_heading(title,level=level)

def add_caption(doc,text):
    p=doc.add_paragraph(text); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.keep_with_next=True; p.paragraph_format.space_before=Pt(5); p.paragraph_format.space_after=Pt(5)
    for r in p.runs: r.font.name='Times New Roman'; r.font.size=Pt(10)
    return p

def make_doc(figs):
    doc=Document(); setup_styles(doc)
    doc.core_properties.title='Odyssey Software Engineering Documentation Chapters 1 to 5'
    doc.core_properties.subject='Introduction, related literature, framework, methodology, and screenshot-based results and discussion for the Odyssey learning platform'
    doc.core_properties.author=''
    front=doc.sections[0]; front.page_width=Inches(8.5); front.page_height=Inches(11); front.top_margin=Inches(.8); front.bottom_margin=Inches(.8); front.left_margin=Inches(1); front.right_margin=Inches(1)
    set_page_border(front)
    front.different_first_page_header_footer=True
    # Cover page follows the reference convention while using only Odyssey facts already supplied.
    p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(78); p.paragraph_format.first_line_indent=Inches(0); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('SOFTWARE ENGINEERING DOCUMENTATION'); r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(19)
    p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(15); p.paragraph_format.first_line_indent=Inches(0); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('ODYSSEY'); r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(26)
    p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Inches(0); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('An Expandable, AI-Supported Learning Platform'); r.font.name='Times New Roman'; r.font.size=Pt(15)
    p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(28); p.paragraph_format.first_line_indent=Inches(0); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    r=p.add_run('System Analysis, Requirements, Feasibility, and Design'); r.font.name='Times New Roman'; r.font.size=Pt(13)
    for _ in range(5): doc.add_paragraph()
    p=doc.add_paragraph('Chapters 1 to 5'); p.paragraph_format.first_line_indent=Inches(0); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    for r in p.runs: r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(13)
    for _ in range(5): doc.add_paragraph()
    p=doc.add_paragraph('Prepared 25 October 2026'); p.paragraph_format.first_line_indent=Inches(0); p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    for r in p.runs: r.font.name='Times New Roman'; r.font.size=Pt(12)
    doc.add_page_break()
    # Table of contents placeholder with final static page numbers filled after render.
    p=doc.add_paragraph('TABLE OF CONTENTS'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0)
    for r in p.runs: r.bold=True; r.font.size=Pt(14); r.font.name='Times New Roman'
    toc=[('Chapter 1 INTRODUCTION',1),('1.1 Background of the Study',1),('1.2 Statement of the Problem',2),('1.3 Objectives of the Study',2),('1.4 Significance of the Study',3),('1.5 Scope and Limitations',3),('1.6 Definition of Terms',4),('Chapter 2 REVIEW OF RELATED LITERATURE',5),('2.1 Interactive Simulations in Computing Education',5),('2.2 Multimedia Learning and Visual Explanations',5),('2.3 AI-Supported Learning',6),('2.4 Gamification and Learner Engagement',6),('2.5 Web-Based and Mobile Learning Access',6),('2.6 Synthesis and Research Gap',7),('Chapter 3 THEORETICAL AND CONCEPTUAL FRAMEWORK',8),('3.1 Theoretical Framework',8),('3.2 Conceptual Framework',8),('Chapter 4 METHODOLOGY',10),('4.1 Research and Development Approach',10),('4.2 Agile Development Method',10),('4.3 System Requirements',11),('4.4 Feasibility Analysis',13),('4.5 System Modeling and Design',14),('4.6 Development Environment and Tools',18),('4.7 Verification and Evaluation Plan',18),('Chapter 5 RESULTS AND DISCUSSION',20),('5.1 Learner Experience and Study Tools',20),('5.2 Pengu Study Aids and Feedback',22),('5.3 Interactive Operating-Systems Practice',26),('5.4 Classroom and Instructor Workflows',27),('5.5 Engagement and Administrative Tools',30),('5.6 Discussion and Evidence Limitations',34),('References',35)]
    for title,page in toc:
        p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.left_indent=Inches(.15 if title[0].isdigit() else 0); p.paragraph_format.line_spacing=1.08; p.paragraph_format.space_after=Pt(2); p.paragraph_format.tab_stops.add_tab_stop(Inches(6.35),WD_TAB_ALIGNMENT.RIGHT,WD_TAB_LEADER.DOTS)
        p.add_run(title+'\t'+str(page)).font.name='Times New Roman'
    doc.add_page_break()
    p=doc.add_paragraph('LIST OF FIGURES'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0)
    for r in p.runs: r.bold=True; r.font.size=Pt(14)
    figure_titles=[("Input-Process-Output Model of Odyssey",9),("Agile Software Development Cycle",11),("Main Use Case Diagram for Odyssey",15),("Learner Study Activity Diagram",15),("Lesson Completion Request Sequence Diagram",16),("Conceptual Entity Relationship Diagram",16),("Odyssey System Architecture",17),("Odyssey Deployment Topology",18),("Odyssey home screen and study options",21),("Module route and learning progress",22),("PDF source and Pengu study options",23),("Flashcard question state",24),("Flashcard answer state",25),("Quick Check question and feedback",26),("System Call Tracer interface",27),("My Classrooms and class-joining interface",28),("Classroom modules and displayed progress",29),("Instructor application opening screen",30),("Odyssey learner XP leaderboard",31),("Administrator overview statistics",32),("Administrator user management",33),("Administrator classroom management",34)]
    for i,(t,page) in enumerate(figure_titles,1):
        p=doc.add_paragraph(f'Figure {i}. {t}\t{page}'); p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.line_spacing=1.1; p.paragraph_format.space_after=Pt(5); p.paragraph_format.tab_stops.add_tab_stop(Inches(6.35),WD_TAB_ALIGNMENT.RIGHT,WD_TAB_LEADER.DOTS)
    doc.add_page_break()
    p=doc.add_paragraph('LIST OF TABLES'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0)
    for r in p.runs: r.bold=True; r.font.size=Pt(14)
    for t,page in [('Table 1. Functional Requirements',11),('Table 2. Non-Functional Requirements',12),('Table 3. Economic Feasibility Assessment',13),('Table 4. Development Technology Stack',18),('Table 5. Planned Verification',19)]:
        p=doc.add_paragraph(f'{t}\t{page}'); p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.space_after=Pt(5); p.paragraph_format.tab_stops.add_tab_stop(Inches(6.35),WD_TAB_ALIGNMENT.RIGHT,WD_TAB_LEADER.DOTS)
    body=doc.add_section(WD_SECTION.NEW_PAGE); body.page_width=Inches(8.5); body.page_height=Inches(11); body.top_margin=Inches(.8); body.bottom_margin=Inches(.8); body.left_margin=Inches(1); body.right_margin=Inches(1); body.footer_distance=Inches(.35); body.header_distance=Inches(.35)
    set_page_border(body); add_page_num_restart(body)
    fp=body.footer.paragraphs[0]; fp.alignment=WD_ALIGN_PARAGRAPH.LEFT; fp.paragraph_format.first_line_indent=Inches(0); fp.paragraph_format.space_before=Pt(0); fp.paragraph_format.space_after=Pt(0); border_paragraph(fp,size=18); page_field(fp)
    for r in fp.runs: r.font.name='Times New Roman'; r.font.size=Pt(9); r.font.color.rgb=RGBColor.from_string(ORANGE)

    # CHAPTER 1
    chapter(doc,1,'Introduction')
    section(doc,'1.1 Background of the Study')
    add_body(doc,"Digital learning platforms can bring lesson content, practice, feedback, and classroom activities into one accessible environment. In computer science education, however, topics such as process scheduling, memory management, concurrency, and file systems describe changing states and interactions that are difficult to observe through static text alone. Odyssey addresses this instructional challenge with guided lessons and browser-based simulations that let learners select inputs and inspect step-by-step behavior.")
    add_body(doc,"Odyssey is an expandable learning platform delivered as a cross-platform web application and installable Progressive Web App. Its current Explore Lessons collection focuses on operating-systems concepts, including processes, threads, memory, file systems, system calls, and scheduling. The learning experience also includes quizzes, flashcards, PDF study sessions, progress indicators, profiles, XP, badges, and leaderboards. Pengu provides general-purpose AI-supported tutoring across subjects, while separate AI workflows generate quizzes and flashcards from supported materials.")
    add_body(doc,"The platform also supports instructors who organize classrooms, publish learning materials, create quizzes, and review submissions. Administrators have workflows for account and role management, instructor applications, classrooms, statistics, and audit activity. The web client is implemented with HTML, CSS, and JavaScript. A service worker caches the application shell and selected static assets; authentication, database, API, and AI features rely on network connectivity. A FastAPI service connects authenticated workflows and AI requests with Supabase Auth and PostgreSQL and configured external AI services [1]-[4].")
    add_body(doc,"The current implementation is an educational platform, not a production operating-system emulator. The simulations visualize selected concepts and algorithm behavior; they do not execute guest operating systems or represent real hardware workloads. Odyssey therefore provides a structured way to study and experiment with operating-systems concepts while leaving room for additional subject collections as content is developed.")
    section(doc,'1.2 Statement of the Problem')
    add_body(doc,"Learners studying operating-systems concepts may have difficulty connecting abstract explanations to changing process, memory, scheduling, and concurrency states. Static study materials provide limited opportunity to vary inputs and observe the sequence of algorithm decisions. Learning activities, study aids, progress records, and classroom tasks may also be spread across separate tools, making it harder to maintain a connected study workflow.")
    add_body(doc,"Odyssey is designed to address this instructional and system-design problem through one expandable platform that combines guided lessons, interactive simulations, study tools, learner progress, AI-supported assistance, and classroom functions. The documentation must describe the implemented scope and its constraints accurately. Repository evidence does not establish that all deployment environments are configured, that the platform has passed formal user acceptance, or that it improves learning outcomes.")
    section(doc,'1.3 Objectives of the Study')
    p=add_body(doc,"The general objective is to document the analysis and design of Odyssey as an accessible, installable learning platform that can grow across subjects and currently supports operating-systems instruction through guided content, interactive practice, knowledge checks, and progress feedback.")
    p.paragraph_format.first_line_indent=Inches(.5)
    p=doc.add_paragraph('The specific objectives are to:'); p.paragraph_format.first_line_indent=Inches(.5); p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
    for x in ["provide the current operating-systems lessons and labs while supporting future additions to the Explore Lessons catalog;","provide interactive simulations in which learners can configure or select scenarios and inspect algorithm behavior;","support learner accounts, profiles, progress indicators, XP, badges, and leaderboard features;","provide a general-purpose AI chatbot and AI quiz and flashcard generation from supported study materials;","support instructor workflows for classrooms, learning materials, quizzes, and learner submissions; and","provide administrator workflows for accounts, roles, applications, classrooms, statistics, and activity oversight."]:
        add_bullet(doc,x)
    section(doc,'1.4 Significance of the Study')
    for role,text in [("Learners","Odyssey brings lessons, simulations, quizzes, flashcards, PDF study sessions, progress summaries, and AI-supported assistance into a shared learning environment. Interactive labs can help learners inspect how selected inputs affect modeled operating-systems behavior."),("Instructors","Classroom tools support organizing learners and learning materials, publishing modules, preparing quizzes, and reviewing submissions. The value of these workflows depends on appropriate role assignment and institutional use."),("Administrators and adopters","Role-aware administration provides account, role, application, classroom, statistics, and audit workflows. Adoption still requires operational ownership, privacy practices, provider configuration, and deployment monitoring."),("Future developers and researchers","The modular client, FastAPI service, Supabase integration, and conceptual models provide a reference for extending the platform and planning formal evaluation. Further research is needed to assess usability, accessibility, reliability, learning outcomes, and operating costs.")]:
        p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.left_indent=Inches(.25); p.paragraph_format.space_after=Pt(5); r=p.add_run(role+". "); r.bold=True; p.add_run(text)
    section(doc,'1.5 Scope and Limitations')
    add_body(doc,"The documented system includes a cross-platform web client and installable PWA; operating-systems lessons and browser-side simulations; quizzes, flashcards, and PDF study workflows; learner profiles and progress features; classroom and administration workflows; a FastAPI backend; Supabase Auth and PostgreSQL integration; configured AI study endpoints; and deployment definitions targeting Vercel and Render [1]-[5].")
    add_body(doc,"The built-in Explore Lessons catalog currently focuses on operating systems. Additional subjects require lesson content and supporting activities before they can appear in the catalog. Pengu is intended to answer questions across subjects, but its availability and behavior depend on backend configuration and an external AI provider. The service worker caches the app shell and selected static assets; live API, authentication, database, and AI operations need a network connection. Some preferences, quiz history, simulator state, and viewed-lesson markers are held in browser local storage and may not synchronize across devices.")
    add_body(doc,"This documentation is based on the supplied project repository and existing system documentation. It does not claim that a production environment is active or correctly configured. No measured response-time, concurrency, accessibility-conformance, uptime, cost, user-acceptance, security-certification, or learning-outcome evidence was supplied. Simulations are educational models rather than real operating-system execution. AI-generated content may be inaccurate and requires learner judgment and review.")
    section(doc,'1.6 Definition of Terms')
    terms=[("Administrator","An authorized user with access to supported account, role, application, classroom, statistics, and audit workflows."),("Artificial intelligence (AI) study support","Configured chatbot and content-generation workflows that use an external AI service through the backend."),("Classroom","A platform workspace through which an instructor organizes members, modules, and quizzes."),("Learner","A user who studies lessons, runs simulations, completes quizzes, and reviews available progress information."),("Progressive Web App (PWA)","A web application that can be installed on supported devices and uses browser capabilities such as a web manifest and service worker."),("Row Level Security (RLS)","Database policies that control which rows an authenticated role may read or change."),("Simulation","A browser-based educational visualization of a selected operating-systems process or algorithm, not a live operating-system environment."),("Supabase","The configured backend platform used for authentication and PostgreSQL data services."),("Instructor","An authorized user who manages classroom membership, learning materials, quizzes, and related submissions."),("Explore Lessons","The learner-facing catalog of modules and topics; its current built-in subject collection is operating systems.")]
    for term,definition in terms:
        p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.left_indent=Inches(.25); p.paragraph_format.space_after=Pt(4); r=p.add_run(term+". "); r.bold=True; p.add_run(definition)

    # CHAPTER 2
    chapter(doc,2,'Review of Related Literature')
    section(doc,'2.1 Interactive Simulations in Computing Education')
    add_body(doc,"Computer simulations can make a conceptual model available for learner experimentation. In their review of discovery learning with simulations, de Jong and van Joolingen [6] describe how learners can infer model behavior by changing conditions and observing outcomes. They also identify difficulties associated with unguided discovery and discuss instructional support that can help learners use simulations productively. This finding supports coupling a simulation with explanations and structured learning activities rather than presenting an unexplained sandbox.")
    add_body(doc,"The principle is relevant to operating-systems topics because many concepts involve state transitions, ordered decisions, and resource constraints. A scheduling lab, for example, can make an algorithm's selection order and waiting times visible when the learner changes a workload. A process or memory lab can expose intermediate states that are otherwise described symbolically. Odyssey's simulations follow this instructional pattern by allowing learners to select inputs and inspect traces, while lesson content supplies context. The models remain simplifications and should be interpreted as teaching aids rather than measurements of a real computer.")
    section(doc,'2.2 Multimedia Learning and Visual Explanations')
    add_body(doc,"Mayer's cognitive theory of multimedia learning describes how learners process verbal and pictorial representations through limited-capacity channels and integrate them with prior knowledge [7]. The theory provides a basis for pairing concise explanations with visual representations when a concept depends on spatial relationships, sequences, or changes over time. Interactive visualizations can extend that pairing by allowing a learner to manipulate selected inputs and observe modeled consequences.")
    add_body(doc,"For Odyssey, visual traces and diagrams can help explain process states, scheduling order, memory placement, and thread interactions. These visuals need clear labels and explanations so that learners can connect each displayed state with the underlying concept. A visual display alone does not establish learning effectiveness, and cluttered or unsupported animation can distract from the instructional objective. This study treats visual simulations as a design feature whose usability and educational value require later evaluation.")
    section(doc,'2.3 AI-Supported Learning')
    add_body(doc,"AI-based tutoring can provide responsive explanations and practice prompts, but evidence about outcomes depends on how the tutor is designed and evaluated. Kestin et al. [8] reported a randomized controlled study in an introductory university physics course in which a research-designed AI tutor was compared with active classroom instruction. The study provides evidence that an AI tutor can support learning in a particular course when it is structured around the instructional material. Its setting and tutor design differ from Odyssey, so the results cannot be transferred directly to Odyssey or to other subjects.")
    add_body(doc,"Odyssey includes Pengu as a general-purpose chatbot and separate workflows for generating quizzes and flashcards from supported study materials. The platform routes AI requests through the backend so provider credentials remain outside the browser. Generated explanations and study items can be useful prompts for review, but they may be incomplete or incorrect. The system therefore should be evaluated for answer quality, relevance, safety, response time, and learner understanding. The current project records do not provide those evaluation results.")
    section(doc,'2.4 Gamification and Learner Engagement')
    add_body(doc,"Gamification applies selected game elements, such as points, badges, or progress displays, to a non-game activity. Sailer and Homner [9] synthesized experimental evidence about gamification in education and found that effects depend on the specific intervention and learning outcome. Their review cautions against treating game mechanics as a guarantee of improved learning. Progress indicators may make completion visible and support goal setting, but they should remain connected to meaningful learning activities.")
    add_body(doc,"Odyssey includes XP, streaks, badges, profiles, statistics, and leaderboards as engagement and progress features. These mechanisms can communicate activity and completion, while quizzes, lessons, and simulations provide the underlying learning tasks. Whether these features improve persistence or learning for Odyssey users is an empirical question and is not established by the code inventory or system design.")
    section(doc,'2.5 Web-Based and Mobile Learning Access')
    add_body(doc,"Browser-based delivery can reduce the need for learners to install a platform-specific application, while PWA capabilities can support installation and caching of selected static resources on supported devices. Odyssey's manifest and service worker are intended to provide this app-like access and cache the application shell. The cached shell does not make hosted authentication, database operations, or AI workflows available offline; those features depend on configured services and connectivity [5].")
    add_body(doc,"Cross-device access also depends on responsive interfaces, browser compatibility, accessible interaction, and reliable server configuration. The repository includes desktop and mobile-oriented client pages, but source inspection alone does not establish conformance with an accessibility standard or consistent behavior on every device. These concerns inform the platform's non-functional requirements and future verification plan.")
    section(doc,'2.6 Synthesis and Research Gap')
    add_body(doc,"The reviewed literature supports several design choices in Odyssey: guided simulations can make conceptual models available for experimentation; verbal explanations and visual representations can work together; AI tutoring can support learning when it is designed around instruction; and gamification may support engagement when connected to meaningful tasks. PWA delivery can broaden access to the web client, although network-dependent services remain subject to connectivity and deployment conditions.")
    add_body(doc,"The cited work does not evaluate Odyssey, its operating-systems lessons, its specific simulations, its general-purpose Pengu chatbot, or its classroom workflows. The project documentation also does not include a controlled learning study, formal usability evaluation, accessibility audit, or production reliability measurements. Odyssey's contribution at this stage is a documented, integrated platform design and implementation that combines these functions. Establishing educational effectiveness and operational quality requires planned testing and user evaluation beyond the present chapters.")

    # CHAPTER 3
    chapter(doc,3,'Theoretical and Conceptual Framework')
    section(doc,'3.1 Theoretical Framework')
    section(doc,'3.1.1 Experiential Learning through Guided Simulation',3)
    add_body(doc,"This study draws on the view of simulation-supported learning as guided exploration of a model. Learners can select or change conditions, observe what the model does, and connect outcomes to the concept being studied [6]. Because open-ended exploration can create confusion, Odyssey pairs its labs with lesson material and visible traces. The framework supports the design of interactive practice; it does not predict a measured learning gain for this system.")
    section(doc,'3.1.2 Cognitive Theory of Multimedia Learning',3)
    add_body(doc,"Mayer's theory explains the potential value of coordinating words and pictures while accounting for limited processing capacity [7]. Odyssey applies this principle through written lesson explanations, diagrams, and visual simulation traces. The design implication is to keep each visual focused, labeled, and connected to the relevant explanation so learners can integrate the representation with prior knowledge.")
    section(doc,'3.1.3 Iterative Software Development',3)
    add_body(doc,"Odyssey's development is organized around iterative work: identify requirements, design a feature, implement it, inspect its behavior, and refine it. This is consistent with Agile principles of iterative delivery and ongoing review. The repository does not contain evidence of formal sprint records or user feedback for every iteration, so the methodology chapter describes the intended development cycle without claiming a documented cadence or measured stakeholder participation.")
    section(doc,'3.2 Conceptual Framework')
    add_body(doc,"The conceptual framework uses the Input-Process-Output model to show how learner, instructor, system, and study data are transformed into learning and management functions. Inputs include user and classroom data, lesson materials, simulation choices, study content, and progress records. System processes present content, execute simulations, generate study aids, manage classes, and return progress information. Outputs include an expandable learning platform, visible practice traces, study feedback, and administrative workflows.")
    add_figure(doc,figs['ipo-model'],'Figure 1. Input-Process-Output Model of Odyssey')
    add_body(doc,"The IPO model is conceptual. It groups functions to explain the study's system logic; it does not represent a single database transaction or prove an educational result. Protected server operations pass through the API and database policies, while selected preferences and learning activity may remain in browser storage.")

    # CHAPTER 4
    chapter(doc,4,'Methodology')
    section(doc,'4.1 Research and Development Approach')
    add_body(doc,"This work follows a system analysis and design approach focused on documenting the existing Odyssey implementation. Requirements, architecture, roles, and workflows are derived from the supplied Odyssey documentation and repository source files. The approach identifies observable functions and technical boundaries; it does not report participant recruitment, survey results, or controlled educational outcomes because those data were not provided.")
    add_body(doc,"The development process is described as iterative software development. Requirements and models are refined as implementation details become available, then checked against the client, backend, database, and deployment configuration. Any future study of user acceptance or learning effectiveness should define participants, instruments, procedures, consent, data handling, and analysis separately before collecting results.")
    section(doc,'4.2 Agile Development Method')
    add_body(doc,"The Agile cycle used to organize Odyssey's feature work is summarized in Figure 2. Planning identifies a feature and its acceptance needs; design describes the user workflow and technical boundary; implementation updates client, API, or data components; testing checks the change; and review informs the next refinement. The cycle can be repeated for lesson, simulation, progress, classroom, administration, or AI functions.")
    add_figure(doc,figs['agile-cycle'],'Figure 2. Agile Software Development Cycle')
    add_body(doc,"Agile is suitable for a platform whose modules and service integrations can be developed in increments. This documentation does not assert specific iteration dates, sprint lengths, team ceremonies, or stakeholder review records because these were not included in the source material.")
    section(doc,'4.3 System Requirements')
    section(doc,'4.3.1 Functional Requirements',3)
    add_body(doc,"The following functional requirements summarize behavior visible in the supplied documentation and repository. Role and persistence boundaries are included where they affect access or system behavior.")
    fr=[("FR-01","The system shall support account registration, sign-in, sign-out, and password-reset requests through its authentication service."),("FR-02","The system shall allow an authenticated user to retrieve and update that user's profile."),("FR-03","The system shall validate Supabase access tokens and apply role checks to protected API operations where required."),("FR-04","The system shall display available learning modules and topic content."),("FR-05","The system shall provide interactive educational simulations for supported operating-systems concepts, including scheduling, memory, processes, threads, file systems, deadlocks, disks, system calls, and boot topics."),("FR-06","The system shall allow learners to select or enter scenario inputs and inspect simulation traces or results."),("FR-07","The system shall provide quiz, flashcard, and PDF study workflows in the web client."),("FR-08","The system shall provide learner progress summaries and module-completion workflows through supported progress operations."),("FR-09","The system shall support XP, streak, badge, profile, statistics, and leaderboard workflows where implemented."),("FR-10","The system shall retain selected preferences and local learning activity in browser storage where implemented."),("FR-11","The system shall provide a general-purpose AI chatbot and AI workflows that generate quizzes and flashcards from supported materials."),("FR-12","The system shall keep AI provider credentials in backend configuration and return generated study content or chatbot responses to the client."),("FR-13","The system shall allow authorized instructors to create and manage classrooms and memberships."),("FR-14","The system shall allow instructors to manage classroom modules and quizzes, including questions and submissions."),("FR-15","The system shall allow authorized administrators to manage supported user records and roles, review instructor applications, inspect statistics and audit entries, and manage classrooms.")]
    add_caption(doc,'Table 1. Functional Requirements')
    add_table(doc,['ID','Functional requirement'],fr,widths=[1.0,5.5])
    section(doc,'4.3.2 Non-Functional Requirements',3)
    nfr=[("NFR-01 Security","Protected API routes shall validate identity and roles; database Row Level Security shall restrict data access."),("NFR-02 Transport","Hosted deployment shall use HTTPS, configured CORS allow-lists, security headers, and request-size limits."),("NFR-03 Abuse resistance","Configured global, authentication, and API rate limits shall be applied; multi-instance deployments require shared rate-limit storage for consistent enforcement."),("NFR-04 Input handling","API inputs shall be validated and sanitized, and client errors shall not expose internal exceptions."),("NFR-05 Usability","Lessons and simulations shall present understandable controls and feedback on desktop and mobile layouts."),("NFR-06 Availability","The client and API depend on configured hosting and Supabase services; no availability target is documented."),("NFR-07 Maintainability","Client pages, API routers, middleware, and service integrations shall remain modular."),("NFR-08 Privacy","Account, progress, classroom, and administration data shall be protected through access policies and secure handling of secrets."),("NFR-09 Compatibility","The system shall support modern browsers and PWA installation where available; cached static files do not provide offline access to hosted services."),("NFR-10 Performance","No response-time or concurrency target is documented; a target should be set after measuring an agreed workload.")]
    add_caption(doc,'Table 2. Non-Functional Requirements')
    add_table(doc,['ID','Non-functional requirement'],nfr,widths=[1.5,5.0])
    section(doc,'4.4 Feasibility Analysis')
    section(doc,'4.4.1 Technical Feasibility',3)
    add_body(doc,"The repository contains a web client built with HTML, CSS, and JavaScript; a Python FastAPI service; Supabase Auth and PostgreSQL integrations; and route groups for authentication, profiles, progress, modules, statistics, administration, classrooms, AI, applications, and health. Middleware includes request identifiers, security headers, gzip, CORS, rate limiting, sanitization, and logging. The manifest and service worker support installability and caching of selected static files. Repository configuration describes Vercel and Render deployment targets [1]-[5].")
    add_body(doc,"Deployment requires valid Supabase settings, database policies and migrations, hosting environment variables, allowed origins, external AI credentials, and network access to hosted services. In-memory rate limiting is not shared across multiple API instances, and browser-local activity may not synchronize across devices. These constraints are technically addressable but require configuration and validation in the target environment.")
    section(doc,'4.4.2 Organizational Feasibility',3)
    add_body(doc,"The implementation uses common web and database technologies and separates the browser client from API and data responsibilities. Its route and page organization can support contributors with frontend, Python API, database, and deployment skills. Classroom workflows can support instruction when an adopting organization assigns roles and operating responsibilities.")
    add_body(doc,"The project records do not identify a sponsoring institution, deployment owner, support team, training plan, or approved operating policy. An adopter should assign responsibility for account administration, classroom setup, content review, privacy requests, incident response, and deployment secrets. Organizational feasibility therefore depends on local ownership and operational readiness.")
    section(doc,'4.4.3 Economic Feasibility',3)
    econ=[("Development effort","Source code is available; historical labor hours and labor rates are not recorded."),("Hosting and database","Configuration targets Vercel, Render, and Supabase. Actual plans, usage, paid tiers, and invoices were not provided."),("AI service","AI features depend on an external provider; usage volume, quotas, and charges are undocumented."),("Maintenance","Ongoing work includes updates, dependency maintenance, content review, security work, and support; no annual estimate is documented."),("Potential benefits","Centralized lessons, browser simulations, classroom quizzes, and progress workflows may reduce reliance on separate tools. Benefits have not been measured."),("ROI and payback","Cannot be calculated from available evidence. A calculation needs baseline costs and time, implementation and operating costs, measured savings or valued benefits, and a defined evaluation period.")]
    add_caption(doc,'Table 3. Economic Feasibility Assessment')
    add_table(doc,['Category','Evidence-based assessment'],econ,widths=[1.5,5.0])
    add_body(doc,"The project is economically plausible as a software product because it uses a static web client, common open-source components, and managed cloud services. Actual economic feasibility remains conditional on local usage, hosting and AI charges, labor, support, and measured value. The source records do not justify a numerical return-on-investment estimate.")
    section(doc,'4.5 System Modeling and Design')
    section(doc,'4.5.1 Use Case Model',3)
    add_body(doc,"The use case model identifies the main human roles visible in the application and groups their supported activities. Learners study modules, run simulations, use study aids, and review progress. Instructors manage classrooms and quizzes. Administrators oversee supported account, role, application, classroom, statistics, and audit functions. External services are technical dependencies rather than human actors.")
    add_figure(doc,figs['use-case'],'Figure 3. Main Use Case Diagram for Odyssey')
    section(doc,'4.5.2 Learner Study Activity',3)
    add_body(doc,"The study activity begins when a learner selects an Explore Lessons topic. After reading, the learner may practice using a simulation or quiz, review an explanation, and mark the topic complete. Whether a progress update reaches the server depends on the specific workflow and network availability; some activity is browser-local.")
    add_figure(doc,figs['activity'],'Figure 4. Learner Study Activity Diagram')
    section(doc,'4.5.3 Protected Progress Request Sequence',3)
    add_body(doc,"Figure 5 shows a representative authenticated progress request. The learner action is sent from the browser to FastAPI, which validates the access token and request before using the configured Supabase client. A successful response returns to the browser for feedback. This is not a claim that every topic click creates a network request.")
    add_figure(doc,figs['sequence'],'Figure 5. Lesson Completion Request Sequence Diagram')
    section(doc,'4.5.4 Conceptual Data Model',3)
    add_body(doc,"The conceptual data model summarizes major account and classroom relationships described by the schema and application routes. The authenticated identity is represented by Supabase Auth and linked to a public profile using a shared UUID. Classroom ownership and membership connect users with classroom workspaces. Modules and quizzes are managed through classroom workflows. Some activity remains local to the browser, so the model is not an exhaustive database diagram.")
    add_figure(doc,figs['conceptual-erd'],'Figure 6. Conceptual Entity Relationship Diagram')
    add_body(doc,"The figure is a high-level model rather than a migration-generated ERD. It omits implementation-specific fields and constraints not necessary to explain the study, and it does not imply that each conceptual relationship is enforced by a single database constraint.")
    section(doc,'4.5.5 System Architecture',3)
    add_body(doc,"The browser presentation layer contains static pages, lessons, simulations, profiles, classroom tools, and the installable PWA shell. FastAPI provides API routes, middleware, authentication and role checks, protected data operations, and AI request handling. Supabase provides authentication and PostgreSQL with Row Level Security. AI requests pass through the backend to the configured provider so credentials are not placed in browser code. Browser storage and the service-worker cache support selected local preferences and static assets.")
    add_figure(doc,figs['architecture'],'Figure 7. Odyssey System Architecture')
    section(doc,'4.5.6 Deployment Topology',3)
    add_body(doc,"Repository configuration targets Vercel for static web content and Render for the Python API. Supabase provides hosted authentication and PostgreSQL; configured AI requests use an external AI service. Browsers communicate with these hosted components over HTTPS. This is a configuration-level topology and does not verify active production health, service plans, complete secrets, or network policy.")
    add_figure(doc,figs['deployment'],'Figure 8. Odyssey Deployment Topology')
    section(doc,'4.6 Development Environment and Tools')
    tech=[("Web client","HTML, CSS, JavaScript","Lessons, simulations, profiles, classrooms, study tools, and PWA behavior."),("Backend API","Python 3.10 or newer, FastAPI, Uvicorn","API routing, validation, role-aware operations, AI request mediation."),("Authentication and data","Supabase Auth, PostgreSQL, Row Level Security","Identity, relational data, and database access policies."),("AI study support","Configured external AI provider via backend","Chatbot responses and quiz or flashcard generation."),("Deployment targets","Vercel, Render, Supabase","Static frontend, Python API, identity and database services."),("Browser capabilities","Web manifest, service worker, local storage","Installable app shell, static caching, and selected local learning state.")]
    add_caption(doc,'Table 4. Development Technology Stack')
    add_table(doc,['Component','Technology','Role in the system'],tech,widths=[1.45,2.0,3.05])
    section(doc,'4.7 Verification and Evaluation Plan')
    add_body(doc,"Verification should confirm that each requirement is observable in the implemented system and that role checks, validation, database policies, and network-dependent workflows behave as intended. The following test groups provide a plan for a later verification stage; they are not reported results.")
    checks=[("Functional verification","Exercise registration, sign-in, reset, profiles, lesson display, simulator inputs and traces, quizzes, flashcards, PDF study, progress, classroom operations, admin workflows, and AI requests."),("Authorization and privacy review","Check token validation, role boundaries, Row Level Security policies, secret placement, input sanitization, CORS, security headers, and rate limiting."),("Compatibility and usability review","Inspect responsive behavior, keyboard operation, readable labels, feedback, and PWA installation on supported browsers and devices."),("Service and network checks","Verify configured deployment, health routes, database connectivity, AI-provider handling, offline app-shell caching, and graceful failure when live services are unavailable."),("User evaluation","After approval and participant procedures are defined, collect learner and instructor feedback using agreed usability and learning measures. Report sample sizes, instruments, conditions, and limitations."),("Operational measurement","Measure response times, concurrency, hosting and AI usage, support effort, and any agreed baseline before making reliability or cost claims.")]
    add_caption(doc,'Table 5. Planned Verification')
    add_table(doc,['Evaluation area','Planned verification'],checks,widths=[1.65,4.85])
    add_body(doc,"Results, discussion of measured findings, user acceptance results, and conclusions are outside the scope of this document and will be prepared only after the required implementation evidence, evaluation records, and figures are available.")

    # CHAPTER 5
    chapter(doc,5,'Results and Discussion')
    section(doc,'5.1 Learner Experience and Study Tools')
    add_body(doc,"The supplied interface screenshots show an Odyssey home screen with learner currency and streak indicators, a study upload option, and shortcuts to lessons and rankings. The learning-progress screen presents a four-module route, completion status, topic count, and a review action. These are the values and controls visible in the supplied captures; they are not a measurement of overall learner participation or achievement.")
    imgroot=Path(r'C:\Users\ADMIN\Downloads')
    screenshots=[
        ('893164572_4720374971529478_690920164102587946_n.jpg','Figure 9. Odyssey home screen and study options'),
        ('891892893_29566242113011484_2981868727649773868_n.jpg','Figure 10. Module route and learning progress'),
    ]
    for name,caption in screenshots: add_figure(doc,imgroot/name,caption,width=3.0)
    section(doc,'5.2 Pengu Study Aids and Feedback')
    add_body(doc,"The screenshots document multiple study modes tied to learner-provided material. The PDF study screen identifies Module 5 as its source and offers memorization, challenge, and question-and-answer options. The flashcard screens show a prompt followed by its revealed explanation. The Quick Check screen shows a multiple-choice question and explanatory feedback. These images illustrate interface states and the displayed example content; they do not establish quiz accuracy across a question bank or improvement in retention.")
    screenshots=[
        ('893937455_4260671834230473_7582237102329824428_n.jpg','Figure 11. PDF source and Pengu study options'),
        ('846908336_2396804114423632_2536424537032601924_n.jpg','Figure 12. Flashcard question state'),
        ('894687997_994107373752824_7166438679690070924_n.jpg','Figure 13. Flashcard answer state'),
        ('892724062_1521019000087167_829268459393699876_n.jpg','Figure 14. Quick Check question and feedback'),
    ]
    for name,caption in screenshots: add_figure(doc,imgroot/name,caption,width=3.0)
    section(doc,'5.3 Interactive Operating-Systems Practice')
    add_body(doc,"The System Call Tracer screenshot presents a program-selection control, execution and clear actions, a step-by-step option, and a next-step control. It documents the lab interface for exploring transitions between user and kernel mode. The supplied image does not show a completed execution trace, so no specific system-call output or runtime result is reported here.")
    add_figure(doc,imgroot/'896655243_1114549514531947_6299618814024409947_n.jpg','Figure 15. System Call Tracer interface',width=3.0)
    section(doc,'5.4 Classroom and Instructor Workflows')
    add_body(doc,"The classroom screenshots show a join-code field and a listed BSCS 3A classroom, followed by a classroom detail page with module and resource navigation, class options, a progress display, and a quiz-review action. A separate instructor-application screen shows the opening decision step. These captures document selected learner and instructor-facing workflows; they do not show a completed application or verify that all classroom actions succeeded.")
    screenshots=[
        ('891004360_2082420872435367_1061858712284001231_n.jpg','Figure 16. My Classrooms and class-joining interface'),
        ('897806037_1286230080362837_5115162308474805406_n.jpg','Figure 17. Classroom modules and displayed progress'),
        ('892947122_1680167570137318_782324479888283757_n.jpg','Figure 18. Instructor application opening screen'),
    ]
    for name,caption in screenshots: add_figure(doc,imgroot/name,caption,width=3.0)
    section(doc,'5.5 Engagement and Administrative Tools')
    add_body(doc,"The leaderboard screen ranks learners by XP and includes a badges view. The administrator overview displays account, role, classroom, and average-XP totals, while the users and classrooms screens show management lists. Counts and names shown in these images reflect the captured interface at that moment and should not be treated as current operational totals or independently audited records.")
    screenshots=[
        ('898502143_29240216642275866_2505916340822816561_n.jpg','Figure 19. Odyssey learner XP leaderboard'),
        ('901940049_1824881148723738_3061244640033481772_n.jpg','Figure 20. Administrator overview statistics'),
        ('899191427_1000942336397698_6775760069325836039_n.jpg','Figure 21. Administrator user management'),
        ('896655354_1675112450837288_5128266301442765138_n.jpg','Figure 22. Administrator classroom management'),
    ]
    for name,caption in screenshots: add_figure(doc,imgroot/name,caption,width=3.0)
    section(doc,'5.6 Discussion and Evidence Limitations')
    add_body(doc,"Across the supplied captures, Odyssey presents learner study and progress interfaces, AI-assisted study aids, a system-call lab, classroom tools, a leaderboard, and administration views. This evidence is descriptive and limited to visible screens and example states. It does not verify all controls, security, accessibility, reliability, response time, usability, or learning effectiveness. Those claims require a defined protocol, representative tasks and participants where applicable, collected measures, and documented results, which were not provided.")

    # References follow Chapter 5; measured evaluation data were not supplied.
    doc.add_page_break(); p=doc.add_paragraph('REFERENCES'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.keep_with_next=True
    for r in p.runs: r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(14)
    refs=[
        '[1] Odyssey project repository. Backend README: backend stack, architecture, API routes, security configuration, and setup notes. D:\\odyssey-system\\os-odyssey\\backend\\README.md.',
        '[2] Odyssey project repository. FastAPI application factory, middleware, routers, and service initialization. D:\\odyssey-system\\os-odyssey\\backend\\app\\main.py.',
        '[3] Odyssey project repository. Database schema, Supabase profile table, Row Level Security policies, and profile trigger. D:\\odyssey-system\\os-odyssey\\database\\schema.sql.',
        '[4] Odyssey project repository. Frontend HTML, CSS, and JavaScript for lessons, simulations, profiles, classrooms, and AI study workflows. D:\\odyssey-system\\os-odyssey\\frontend\\.',
        '[5] Odyssey project repository. Web app manifest, service worker, and deployment configuration. D:\\odyssey-system\\os-odyssey\\manifest.json; D:\\odyssey-system\\os-odyssey\\sw.js; D:\\odyssey-system\\vercel.json; D:\\odyssey-system\\render.yaml.',
        '[6] T. de Jong and W. R. van Joolingen. 1998. Scientific discovery learning with computer simulations of conceptual domains. Review of Educational Research 68, 2 (1998), 179-202. https://doi.org/10.3102/00346543068002179.',
        '[7] R. E. Mayer. 2009. Multimedia Learning, 2nd ed. Cambridge University Press. https://doi.org/10.1017/CBO9780511811678.',
        '[8] G. Kestin, K. Miller, A. Klales, T. Milbourne, and G. Ponti. 2025. AI tutoring outperforms in-class active learning: an RCT introducing a novel research-based design in an authentic educational setting. Scientific Reports 15 (2025), 17480. https://doi.org/10.1038/s41598-025-97652-6.',
        '[9] M. Sailer and L. Homner. 2020. The gamification of learning: a meta-analysis. Educational Psychology Review 32 (2020), 77-112. https://doi.org/10.1007/s10648-019-09498-w.'
    ]
    for ref in refs:
        p=doc.add_paragraph(ref); p.paragraph_format.first_line_indent=Inches(-.3); p.paragraph_format.left_indent=Inches(.3); p.paragraph_format.line_spacing=1.15; p.paragraph_format.space_after=Pt(6); p.alignment=WD_ALIGN_PARAGRAPH.LEFT
    doc.save(OUT)
    print(OUT)

if __name__=='__main__':
    diagrams={name:save(name,fn,size) for name,fn,size in make_diagrams()}
    make_doc(diagrams)
