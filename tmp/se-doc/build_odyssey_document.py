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
OUT = ROOT / "output" / "Odyssey_SE_Documentation_Chapters_1-5_Chapter4_LL_Format_AgileCycleRedesigned.docx"
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
    def stick_actor(d, x, y, label):
        d.ellipse((x-15,y,x+15,y+30),outline='#222222',width=3)
        d.line((x,y+30,x,y+95),fill='#222222',width=3)
        d.line((x-28,y+52,x+28,y+52),fill='#222222',width=3)
        d.line((x,y+95,x-24,y+132),fill='#222222',width=3)
        d.line((x,y+95,x+24,y+132),fill='#222222',width=3)
        f=font(23,True); bb=d.textbbox((0,0),label,font=f)
        d.text((x-(bb[2]-bb[0])/2,y+139),label,font=f,fill='#222222')

    def ellipse_case(d, cx, cy, label, w=300, h=90):
        d.ellipse((cx-w/2,cy-h/2,cx+w/2,cy+h/2),fill='#F9A13B',outline='#333333',width=3)
        f=font(22); lines=wrap(d,label,f,w-30); lh=28
        y=cy-(len(lines)*lh)/2
        for line in lines:
            bb=d.textbbox((0,0),line,font=f)
            d.text((cx-(bb[2]-bb[0])/2,y),line,font=f,fill='#222222'); y+=lh

    def relation_line(d, a, b, label, bend=None):
        # UML relationships use thin black connectors and a labeled dashed arrow.
        pts=[a,b] if bend is None else [a,bend,b]
        for (x1,y1),(x2,y2) in zip(pts,pts[1:]):
            import math
            length=math.hypot(x2-x1,y2-y1); steps=max(1,int(length/18))
            for i in range(0,steps,2):
                t0=i/steps; t1=min((i+1)/steps,1)
                d.line((x1+(x2-x1)*t0,y1+(y2-y1)*t0,x1+(x2-x1)*t1,y1+(y2-y1)*t1),fill='#555555',width=2)
        x1,y1=pts[-2]; x2,y2=pts[-1]
        import math
        ang=math.atan2(y2-y1,x2-x1); n=16
        head=[(x2,y2),(x2-n*math.cos(ang-.45),y2-n*math.sin(ang-.45)),(x2-n*math.cos(ang+.45),y2-n*math.sin(ang+.45))]
        d.line((head[1],head[0],head[2]),fill='#555555',width=2)
        mid=((a[0]+b[0])/2,(a[1]+b[1])/2) if bend is None else bend
        f=font(18,True); bb=d.textbbox((0,0),label,font=f)
        d.rectangle((mid[0]-bb[2]/2-5,mid[1]-17,mid[0]+bb[2]/2+5,mid[1]+9),fill='white')
        d.text((mid[0]-bb[2]/2,mid[1]-14),label,font=f,fill='#333333')

    def uml_relationship(name, actor, usecases, associations, links):
        def draw(d,s):
            d.rectangle((300,45,1550,900),fill='white',outline='#333333',width=3)
            d.text((330,60),'ODYSSEY — '+name.upper(),font=font(24,True),fill='#222222')
            stick_actor(d,115,390,actor)
            for cx,cy,label in usecases: ellipse_case(d,cx,cy,label)
            for idx in associations:
                cx,cy,_=usecases[idx]
                d.line((150,455,cx-150,cy),fill='#555555',width=2)
            for i,j,label,bend in links:
                relation_line(d,(usecases[i][0],usecases[i][1]),(usecases[j][0],usecases[j][1]),label,bend)
        return save('uc-rel-'+name.lower().replace(' ','-'),draw,(1600,950))

    def activity_flow(name, lanes, nodes, edges, size=(1600,950)):
        def draw(d,s):
            w,h=s; top=70; bottom=h-40
            if lanes:
                lane_w=(w-100)/len(lanes)
                for i,lane in enumerate(lanes):
                    x=50+i*lane_w
                    d.rectangle((x,top,x+lane_w,bottom),outline='#777777',width=2)
                    f=font(22,True); bb=d.textbbox((0,0),lane,font=f)
                    d.text((x+(lane_w-(bb[2]-bb[0]))/2,top+10),lane,font=f,fill='#222222')
            for item in nodes:
                kind,label,xy=item
                x1,y1,x2,y2=xy
                if kind=='decision':
                    cx=(x1+x2)//2; cy=(y1+y2)//2
                    d.polygon([(cx,y1),(x2,cy),(cx,y2),(x1,cy)],fill='white',outline='#333333')
                elif kind=='start':
                    d.ellipse(xy,fill='#222222')
                elif kind=='end':
                    d.ellipse(xy,fill='white',outline='#222222',width=3)
                    d.ellipse((x1+8,y1+8,x2-8,y2-8),fill='#222222')
                else:
                    d.rectangle(xy,fill='white',outline='#333333',width=2)
                if label:
                    f=font(21); lines=wrap(d,label,f,x2-x1-24); lh=26
                    cy=(y1+y2)/2-len(lines)*lh/2
                    for line in lines:
                        bb=d.textbbox((0,0),line,font=f); d.text(((x1+x2-(bb[2]-bb[0]))/2,cy),line,font=f,fill='#222222'); cy+=lh
            for a,b,label in edges:
                ax,ay=a; bx,by=b
                arrow(d,(ax,ay),(bx,by),color='555555',width=2)
                if label:
                    f=font(18,True); bb=d.textbbox((0,0),label,font=f)
                    d.rectangle(((ax+bx)/2-bb[2]/2-3,(ay+by)/2-20,(ax+bx)/2+bb[2]/2+3,(ay+by)/2+5),fill='white')
                    d.text(((ax+bx-bb[2])/2,(ay+by)/2-18),label,font=f,fill='#333333')
        return save('activity-'+name.lower().replace(' ','-'),draw,size)

    def sequence_diagram(name, participants, messages, size=(1600,900)):
        def draw(d,s):
            w,h=s; top=115; bottom=h-45
            xs=[100+i*(w-200)/(len(participants)-1) for i in range(len(participants))]
            for x,label in zip(xs,participants):
                d.rectangle((x-105,35,x+105,105),fill='white',outline='#333333',width=2)
                f=font(21,True); lines=wrap(d,label,f,195); y=53
                for line in lines:
                    bb=d.textbbox((0,0),line,font=f); d.text((x-(bb[2]-bb[0])/2,y),line,font=f,fill='#222222'); y+=25
                for yy in range(top,bottom,18): d.line((x,yy,x,min(yy+9,bottom)),fill='#777777',width=2)
            y=145
            for i,j,label,kind in messages:
                x1,x2=xs[i],xs[j]
                if kind=='return':
                    d.line((x1,y,x2,y),fill='#555555',width=2)
                    for xx in range(int(min(x1,x2)+4),int(max(x1,x2)),18):
                        d.line((xx,y, min(xx+9,max(x1,x2)),y),fill='white',width=2)
                    d.line((x1,y,x2,y),fill='#555555',width=1)
                    import math
                    ang=math.atan2(0,x2-x1); n=13
                    pts=[(x2,y),(x2-n,y-6),(x2-n,y+6)] if x2>=x1 else [(x2,y),(x2+n,y-6),(x2+n,y+6)]
                    d.line((pts[1],pts[0],pts[2]),fill='#555555',width=2)
                else:
                    arrow(d,(x1,y),(x2,y),color='333333',width=2)
                f=font(18); bb=d.textbbox((0,0),label,font=f)
                mid=(x1+x2)/2
                d.rectangle((mid-bb[2]/2-4,y-26,mid+bb[2]/2+4,y-4),fill='white')
                d.text((mid-bb[2]/2,y-25),label,font=f,fill='#222222')
                y+=84
        return save('sequence-'+name.lower().replace(' ','-'),draw,size)

    def ipo(d,s):
        w,h=s
        green="#91B66D"; dark="#486E38"; pale="#FFFFFF"
        left,right=55,1545; top,header_bottom,base=75,205,930
        x1,x2=left+500,left+1000
        # A segmented arrow band and three aligned columns follow the LL reference.
        d.rectangle((left,header_bottom,right,base),fill=pale,outline=green,width=5)
        d.line((x1,header_bottom,x1,base),fill=green,width=5)
        d.line((x2,header_bottom,x2,base),fill=green,width=5)
        headers=[[(left,top),(left+460,top),(left+500,top+65),(left+460,header_bottom),(left,header_bottom)],
                 [(left+460,top),(left+960,top),(left+1000,top+65),(left+960,header_bottom),(left+460,header_bottom),(left+500,top+65)],
                 [(left+960,top),(right,top),(right,header_bottom),(left+960,header_bottom),(left+1000,top+65)]]
        titles=["Input","Process","Output"]
        col_centers=[(left+x1)//2,(x1+x2)//2,(x2+right)//2]
        title_font=font(36,True)
        for pts,title,cx in zip(headers,titles,col_centers):
            d.polygon(pts,fill=green)
            bbox=d.textbbox((0,0),title,font=title_font); tw=bbox[2]-bbox[0]
            d.text((cx-tw/2,top+35),title,font=title_font,fill="#1F1F1F")
        d.line([(left+460,top),(left+500,top+65),(left+460,header_bottom)],fill="#FFFFFF",width=9)
        d.line([(left+960,top),(left+1000,top+65),(left+960,header_bottom)],fill="#FFFFFF",width=9)
        bodies=[
            ["Learner and instructor accounts","Course and lesson content","Simulation choices and inputs","Quiz and flashcard materials","Classroom and assignment data","Profile and progress records"],
            ["Present guided lessons","Run interactive OS simulations","Generate AI study aids","Deliver quizzes and flashcards","Record progress and achievements","Support classroom workflows"],
            ["Accessible, expandable learning platform","Visible simulation traces","Practice and study feedback","Learner progress summaries","Instructor-managed activities","Administrative oversight"]
        ]
        body_font=font(28); bullet_font=font(30,True); max_text=415; line_h=38; gap=23
        col_lefts=[left,x1,x2]
        for col,items in enumerate(bodies):
            x=col_lefts[col]+34; y=250
            for item in items:
                d.text((x,y-2),"•",font=bullet_font,fill="#1F1F1F")
                lines=wrap(d,item,body_font,max_text)
                for line in lines:
                    d.text((x+38,y),line,font=body_font,fill="#222222")
                    y+=line_h
                y+=gap
    def cases(d,s):
        d.rectangle((360,55,1550,650),fill='white',outline='#333333',width=3)
        d.text((390,70),'ODYSSEY LEARNING PLATFORM',font=font(25,True),fill='#222222')
        stick_actor(d,110,115,'Student')
        stick_actor(d,110,315,'Professor')
        stick_actor(d,110,515,'Administrator')
        usecases=[(650,155,'Study modules and run simulations'),(650,285,'Take quizzes and use study aids'),(650,415,'View profile and progress'),(1190,250,'Manage classrooms and quizzes'),(1190,455,'Manage users and platform')]
        for cx,cy,label in usecases: ellipse_case(d,cx,cy,label,w=430,h=92)
        # Explicit associations from each role to the functions it can invoke.
        for j in [0,1,2]: d.line((140,180,usecases[j][0]-215,usecases[j][1]),fill='#333333',width=2)
        d.line((140,380,usecases[3][0]-215,usecases[3][1]),fill='#333333',width=2)
        d.line((140,580,usecases[3][0]-215,usecases[3][1]),fill='#333333',width=2)
        d.line((140,580,usecases[4][0]-215,usecases[4][1]),fill='#333333',width=2)
    def architecture(d,s):
        # Conventional component/layer view: plain boxes, labeled connectors, no card-like styling.
        columns=[(35,80,350,600,'USER CLIENT','Student\nProfessor\nAdministrator'),(435,80,770,600,'WEB CLIENT','HTML / CSS / JavaScript\nLesson and simulator pages\nClassroom and admin pages\nLocal storage\nService worker and PWA shell'),(855,80,1190,600,'FASTAPI SERVICE','Authentication\nRole checks\nProfiles and progress\nClassrooms and quizzes\nAI request handling\nAdmin and audit routes'),(1275,80,1565,290,'SUPABASE','Auth\nPostgreSQL\nRow Level Security'),(1275,390,1565,600,'EXTERNAL AI','Configured provider\nCalled through backend')]
        for x1,y1,x2,y2,title,body in columns:
            d.rectangle((x1,y1,x2,y2),fill='white',outline='#333333',width=3)
            d.rectangle((x1,y1,x2,y1+60),fill='#F5D7B8',outline='#333333',width=2)
            d.text((x1+14,y1+18),title,font=font(22,True),fill='#222222')
            yy=y1+85
            for line in body.split('\n'):
                d.text((x1+18,yy),line,font=font(20),fill='#222222'); yy+=43
        arrow(d,(360,340),(425,340),color='333333',width=2)
        arrow(d,(780,270),(845,270),color='333333',width=2)
        arrow(d,(780,455),(845,455),color='333333',width=2)
        arrow(d,(1200,205),(1265,205),color='333333',width=2)
        arrow(d,(1200,490),(1265,490),color='333333',width=2)
        d.text((365,306),'HTTPS',font=font(18),fill='#222222')
        d.text((782,231),'API',font=font(18),fill='#222222')
        d.text((1205,166),'DB/Auth',font=font(17),fill='#222222')
        d.text((1203,449),'AI request',font=font(17),fill='#222222')
    def agile(d,s):
        import math
        w,h=s; cx,cy=w/2,h/2; radius=min(w,h)*.365
        phases=[("Requirement\nGathering",-60),("System\nDesign",0),("Development",60),("Testing",120),("Deployment",180),("Review",240)]
        shades=["#347FC1","#438DD0","#347FC1","#438DD0","#347FC1","#438DD0"]
        for (label,center),shade in zip(phases,shades):
            d.pieslice((cx-radius,cy-radius,cx+radius,cy+radius),start=center-30,end=center+30,fill=shade)
        # White spokes separate the six phases, following the clean circular reference.
        for _label,angle in phases:
            a=math.radians(angle-30); ex=cx+radius*math.cos(a); ey=cy+radius*math.sin(a)
            d.line((cx,cy,ex,ey),fill="#FFFFFF",width=12)
        d.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),outline="#2F6FAE",width=8)
        label_font=font(28,True); label_r=radius*.55
        for label,angle in phases:
            a=math.radians(angle); tx=cx+label_r*math.cos(a); ty=cy+label_r*math.sin(a)
            lines=label.split("\n"); line_h=34; y=ty-(len(lines)*line_h)/2
            for line in lines:
                bounds=d.textbbox((0,0),line,font=label_font)
                d.text((tx-(bounds[2]-bounds[0])/2,y),line,font=label_font,fill="#FFFFFF")
                y+=line_h
        # Short outer arcs and tangent arrowheads show the process continuing clockwise.
        orbit=radius+20
        for _label,center in phases:
            end_angle=center+21; d.arc((cx-orbit,cy-orbit,cx+orbit,cy+orbit),start=center-22,end=end_angle,fill="#2F6FAE",width=12)
            a=math.radians(end_angle); tx=cx+orbit*math.cos(a); ty=cy+orbit*math.sin(a)
            tangent=(-math.sin(a),math.cos(a)); normal=(math.cos(a),math.sin(a))
            tip=(tx+18*tangent[0],ty+18*tangent[1]); base=(tx-17*tangent[0],ty-17*tangent[1])
            d.polygon([tip,(base[0]+12*normal[0],base[1]+12*normal[1]),(base[0]-12*normal[0],base[1]-12*normal[1])],fill="#2F6FAE")
    def activity(d,s):
        # Retained as the first, learner-focused activity model; expanded variants are below.
        nodes=[('start','',(750,55,790,95)),('action','Open Explore Lessons',(525,125,1015,195)),('action','Choose module and topic',(525,230,1015,300)),('action','Read lesson content',(525,335,1015,405)),('decision','Practice now?',(640,445,900,535)),('action','Run simulation or quiz',(120,600,600,675)),('action','Review the explanation',(1010,600,1490,675)),('action','Mark topic complete',(525,755,1015,825)),('end','',(755,855,795,895))]
        edges=[((770,96),(770,123),''),((770,196),(770,228),''),((770,301),(770,333),''),((770,406),(770,444),''),((650,490),(360,598),'Yes'),((890,490),(1250,598),'No'),((360,676),(650,753),''),((1250,676),(900,753),''),((770,826),(770,853),'')]
        return activity_flow('learner-study',[],nodes,edges,(1600,950))
    def sequence(d,s):
        return sequence_diagram('protected-progress',['Student','Browser client','FastAPI API','Supabase Auth / DB'],[(0,1,'Complete module in the supported workflow','call'),(1,2,'POST protected progress request + bearer token','call'),(2,3,'Verify JWT; check progress operation','call'),(3,2,'Persist profile progress; return result','return'),(2,1,'Return success or safe error','return'),(1,0,'Show progress feedback','return')],(1600,760))
    def erd(d,s):
        # A restrained, table-like ERD: aligned rows, plain rules, and
        # uncluttered foreign-key relationships. Cardinality is explained
        # in the paragraph below the figure rather than squeezed between boxes.
        entities=[
          ((55,55,500,215),'PROFILES',['id (PK, FK to auth.users)','email, username, role','XP, level, rank, streak','completed_modules']),
          ((600,55,1045,215),'CLASSROOMS',['id (PK)','professor_id (FK to profiles.id)','name, join_code, is_active']),
          ((1100,55,1545,215),'CLASSROOM_MODULES',['id (PK)','classroom_id (FK)','title, content, order_index','is_published']),
          ((55,345,500,505),'CLASSROOM_MEMBERS',['id (PK)','classroom_id (FK)','student_id (FK to profiles.id)','joined_at']),
          ((600,345,1045,505),'CLASSROOM_QUIZZES',['id (PK)','classroom_id (FK)','module_id (nullable FK)','title, is_published']),
          ((1100,345,1545,505),'QUIZ_QUESTIONS',['id (PK)','quiz_id (FK)','question_text, type, options','correct_answer, order_index, points']),
          ((600,640,1045,800),'QUIZ_ATTEMPTS',['id (PK)','quiz_id (FK)','student_id (FK to profiles.id)','answers, score, max_score','started_at, submitted_at']),
        ]
        def route(points):
            for a,b in zip(points,points[1:]): d.line((a,b),fill='#333333',width=3)
        # Draw relationship paths first, so entity borders stay crisp.
        route([(500,135),(600,135)])                         # profile owns classroom
        route([(1045,135),(1100,135)])                       # classroom contains modules
        route([(277,215),(277,345)])                         # profile has memberships
        route([(600,175),(545,175),(545,285),(500,285),(500,385)]) # classroom membership
        route([(822,215),(822,345)])                         # classroom has quizzes
        route([(1322,215),(1322,270),(1070,270),(1070,330),(930,330),(930,345)]) # optional module on quiz
        route([(1045,425),(1100,425)])                       # quiz has questions
        route([(822,505),(822,640)])                         # quiz has attempts
        route([(500,185),(520,185),(520,720),(600,720)])     # profile is quiz taker
        for xy,title,fields in entities:
            x1,y1,x2,y2=xy
            d.rectangle(xy,fill='white',outline='#333333',width=3)
            d.rectangle((x1,y1,x2,y1+42),fill='#E9E9E9',outline='#333333',width=2)
            d.text((x1+14,y1+10),title,font=font(25,True),fill='#222222')
            yy=y1+55
            for field in fields:
                d.text((x1+15,yy),field,font=font(22),fill='#222222'); yy+=26
    def deploy(d,s):
        nodes=[((35,280,300,520),'CLIENT DEVICE','Browser / PWA\nLocal preferences\nCached app shell'),((405,280,690,520),'VERCEL','Static web client\nHTML, CSS, JavaScript'),((800,280,1090,520),'RENDER','FastAPI service\nAPI and middleware'),((1210,80,1560,290),'SUPABASE','Auth and PostgreSQL\nRLS-protected records'),((1210,510,1560,720),'AI PROVIDER','Backend-mediated\nExternal requests')]
        for (x1,y1,x2,y2),title,body in nodes:
            d.rectangle((x1,y1,x2,y2),fill='white',outline='#333333',width=3)
            d.rectangle((x1,y1,x2,y1+55),fill='#F5D7B8',outline='#333333',width=2)
            d.text((x1+14,y1+16),title,font=font(23,True),fill='#222222')
            yy=y1+85
            for line in body.split('\n'): d.text((x1+20,yy),line,font=font(21),fill='#222222'); yy+=38
        arrow(d,(305,400),(395,400),color='333333',width=2)
        arrow(d,(695,400),(790,400),color='333333',width=2)
        arrow(d,(1095,340),(1200,210),color='333333',width=2)
        arrow(d,(1095,475),(1200,610),color='333333',width=2)
        d.text((315,365),'HTTPS',font=font(18),fill='#222222')
        d.text((700,365),'HTTPS API',font=font(18),fill='#222222')
    def class_diagram(d,s):
        # UML class boxes share the ERD grid. The larger compartments keep
        # attributes and operations separate at normal print size.
        classes=[
          ((55,35,500,240),'Profile',['id: UUID','email, username: string','role, XP, level, rank, streak','completed_modules: text[]'],['update_profile()','read_progress()']),
          ((600,35,1045,240),'Classroom',['id: UUID','professor_id: UUID','name, join_code: string','is_active: boolean'],['create_classroom()','update_classroom()']),
          ((1100,35,1545,240),'ClassroomModule',['id, classroom_id: UUID','title, content: text','order_index: integer','is_published: boolean'],['create_module()','update_module()']),
          ((55,320,500,525),'ClassroomMember',['id, classroom_id: UUID','student_id: UUID','joined_at: timestamp'],['join_by_code()','leave_classroom()']),
          ((600,320,1045,525),'ClassroomQuiz',['id, classroom_id: UUID','module_id: UUID (optional)','title: string','is_published: boolean'],['create_quiz()','publish_quiz()']),
          ((1100,320,1545,525),'QuizQuestion',['id, quiz_id: UUID','question_text: string','type, options, answer','order_index, points'],['validate_answer()']),
          ((600,610,1045,815),'QuizAttempt',['id, quiz_id: UUID','student_id: UUID','answers: JSON, score: number','started_at, submitted_at'],['submit()','calculate_score()']),
        ]
        def route(points):
            for a,b in zip(points,points[1:]): d.line((a,b),fill='#333333',width=3)
        route([(500,115),(600,115)])
        route([(1045,115),(1100,115)])
        route([(277,240),(277,320)])
        route([(600,165),(545,165),(545,270),(500,270),(500,400)])
        route([(822,240),(822,320)])
        route([(1322,240),(1322,280),(1070,280),(1070,305),(930,305),(930,320)])
        route([(1045,420),(1100,420)])
        route([(822,525),(822,610)])
        route([(500,190),(520,190),(520,710),(600,710)])
        for (x1,y1,x2,y2),title,attrs,ops in classes:
            d.rectangle((x1,y1,x2,y2),fill='white',outline='#333333',width=3)
            d.rectangle((x1,y1,x2,y1+40),fill='#E9E9E9',outline='#333333',width=2)
            d.text((x1+13,y1+8),title,font=font(25,True),fill='#222222')
            yy=y1+49
            for line in attrs:
                d.text((x1+14,yy),line,font=font(21),fill='#222222'); yy+=24
            d.line((x1,y2-55,x2,y2-55),fill='#555555',width=2)
            yy=y2-48
            for line in ops:
                d.text((x1+14,yy),line,font=font(19),fill='#222222'); yy+=22

    def system_design(d,s):
        # Component map with distinct responsibilities and direct, balanced flows.
        groups=[
          ((35,240,285,625),'USER ROLES',['Student','Professor','Administrator']),
          ((350,140,690,700),'WEB CLIENT',['Lessons and simulations','Study aids and Pengu','Profile and progress','Classroom and admin pages','Local storage and PWA cache']),
          ((755,140,1095,700),'FASTAPI APPLICATION',['Authentication and role checks','Progress and module routes','Classroom and quiz routes','AI and application routes','Validation, rate limits, audit']),
        ]
        def group_frame(xy,title):
            x1,y1,x2,y2=xy
            d.rectangle(xy,fill='white',outline='#333333',width=3)
            d.rectangle((x1,y1,x2,y1+52),fill='#E9E9E9',outline='#333333',width=2)
            d.text((x1+14,y1+14),title,font=font(24,True),fill='#222222')
        def row_item(x1,y1,x2,y2,text):
            d.rectangle((x1,y1,x2,y2),fill='white',outline='#666666',width=2)
            lines=wrap(d,text,font(22),x2-x1-24); yy=y1+10
            for line in lines:
                d.text((x1+12,yy),line,font=font(22),fill='#222222'); yy+=26
        for xy,title,items in groups:
            group_frame(xy,title)
            x1,y1,x2,y2=xy
            top=y1+78
            row_h=76 if title=='USER ROLES' else 76
            gap=28 if title=='USER ROLES' else 22
            for i,item in enumerate(items): row_item(x1+20,top+i*(row_h+gap),x2-20,top+i*(row_h+gap)+row_h,item)
        # Hosted systems are separate components; the browser's local cache
        # is intentionally shown inside the Web Client boundary.
        group_frame((1160,140,1565,390),'DATA SERVICES')
        row_item(1190,225,1535,335,'Supabase Auth, PostgreSQL, and Row Level Security')
        group_frame((1160,450,1565,700),'EXTERNAL AI')
        row_item(1190,540,1535,635,'Configured provider, called by FastAPI')
        # Straight flows make responsibility boundaries explicit.
        arrow(d,(290,420),(340,420),color='333333',width=3)
        arrow(d,(695,420),(745,420),color='333333',width=3)
        arrow(d,(1100,285),(1150,285),color='333333',width=3)
        arrow(d,(1100,575),(1150,575),color='333333',width=3)
        d.text((292,385),'HTTPS',font=font(19),fill='#222222')
        d.text((697,385),'API',font=font(19),fill='#222222')
        d.text((1100,247),'DB / Auth',font=font(18),fill='#222222')
        d.text((1100,537),'AI request',font=font(18),fill='#222222')

    relationship_specs={
      'account':('Student / Professor / Administrator',[(650,170,'Register or log in'),(1150,170,'Verify identity and role'),(650,390,'View or update profile'),(1150,390,'Reset password')],[0,2,3],[(0,1,'<<include>>',(900,175)),(2,1,'<<include>>',(900,285)),(3,1,'<<extend>>',(900,440))]),
      'learning':('Student',[(650,160,'Browse modules'),(1150,160,'Read a lesson'),(650,370,'Run a simulation'),(1150,370,'Take a module quiz'),(900,610,'Record supported completion')],[0,1,2,3],[(0,1,'<<include>>',(900,150)),(2,1,'<<extend>>',(900,260)),(3,1,'<<extend>>',(900,475)),(3,4,'<<include>>',(1080,500))]),
      'study-aids':('Student',[(650,160,'Select or upload study material'),(1150,160,'Extract readable PDF text'),(650,390,'Generate flashcards'),(1150,390,'Generate a quiz'),(900,630,'Ask Pengu for an explanation')],[0,2,3,4],[(0,1,'<<include>>',(900,150)),(2,1,'<<include>>',(900,265)),(3,1,'<<include>>',(1080,275)),(4,1,'<<extend>>',(900,515))]),
      'classroom':('Professor / Student',[(650,155,'Create or join a classroom'),(1150,155,'Manage classroom modules'),(650,370,'Create and publish quiz'),(1150,370,'Attempt published quiz'),(900,620,'Submit answers and view score')],[0,1,2,3,4],[(1,2,'<<include>>',(900,255)),(3,4,'<<include>>',(1080,480)),(2,1,'<<extend>>',(1080,265))]),
      'administration':('Administrator',[(650,160,'Search user accounts'),(1150,160,'Change user role'),(650,385,'Review instructor application'),(1150,385,'Oversee classrooms'),(900,625,'Review statistics and audit events')],[0,1,2,3,4],[(0,1,'<<extend>>',(900,250)),(2,1,'<<include>>',(900,385)),(3,4,'<<include>>',(1080,500))])}

    extra=[]
    for key,(actor,uc,assocs,links) in relationship_specs.items():
        nice=key.replace('-',' ').title()
        extra.append(('usecase-'+key,lambda d,s,actor=actor,uc=uc,assocs=assocs,links=links,nice=nice: uml_relationship(nice,actor,uc,assocs,links),(1600,950)))
    return [
        ("use-case",cases,(1600,700)),("ipo-model",ipo,(1600,1000)),
        ("agile-cycle",agile,(900,900)),("activity",activity,(1600,950)),
        ("sequence",sequence,(1600,760)),("conceptual-erd",erd,(1600,840)),
        ("architecture",architecture,(1600,700)),("deployment",deploy,(1600,800)),
        *extra,
        ('activity-classroom',lambda d,s: activity_flow('classroom-quiz',[],[
            ('start','',(770,55,810,95)),('action','Open classroom and select published quiz',(485,135,1115,205)),('action','Start attempt',(585,245,1015,315)),('action','Answer available questions',(485,355,1115,425)),('decision','Ready to submit?',(640,465,960,555)),('action','Review unanswered items',(85,625,615,700)),('action','Submit answers',(985,625,1515,700)),('action','Calculate and save score',(985,750,1515,820)),('end','',(1225,855,1265,895))],[((790,96),(790,133),''),((790,206),(790,243),''),((790,316),(790,353),''),((790,426),(790,464),''),((660,510),(350,623),'No'),((940,510),(1250,623),'Yes'),((350,701),(670,510),''),((1250,701),(1250,748),''),((1250,821),(1250,853),'')],(1600,950)),(1600,950)),
        ('activity-instructor',lambda d,s: activity_flow('instructor-publish',[],[
            ('start','',(770,45,810,85)),('action','Sign in as professor',(555,120,1025,190)),('action','Open or create classroom',(555,225,1025,295)),('action','Add module or quiz questions',(500,330,1080,400)),('decision','Publish now?',(640,440,960,530)),('action','Save as draft',(100,600,620,675)),('action','Publish for enrolled students',(980,600,1500,675)),('end','',(1225,785,1265,825))],[((790,86),(790,118),''),((790,191),(790,223),''),((790,296),(790,328),''),((790,401),(790,439),''),((660,485),(360,598),'No'),((940,485),(1240,598),'Yes'),((360,676),(700,640),''),((1240,676),(1240,783),'')],(1600,880)),(1600,880)),
        ('sequence-quiz',lambda d,s: sequence_diagram('classroom-quiz-submission',['Student','Browser client','FastAPI API','Supabase DB'],[(0,1,'Open published classroom quiz','call'),(1,2,'GET quiz details with token','call'),(2,3,'Check classroom membership and publication','call'),(3,2,'Return quiz content','return'),(1,2,'POST answers for submission','call'),(2,3,'Validate attempt and store score','call'),(3,2,'Return saved attempt','return'),(2,1,'Return score and response','return')],(1600,900)),(1600,900)),
        ('sequence-ai',lambda d,s: sequence_diagram('AI-study-aid-request',['Student','Browser client','FastAPI API','AI provider'],[(0,1,'Enter material or prompt','call'),(1,2,'POST validated study request','call'),(2,3,'Send prompt using server credentials','call'),(3,2,'Return generated study content','return'),(2,1,'Return quiz or flashcards','return'),(1,0,'Display items for review','return')],(1600,760)),(1600,760)),
        ('class-diagram',class_diagram,(1600,860)),('system-design',system_design,(1600,850))]

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
    toc=[('Chapter 1 INTRODUCTION',1),('1.1 Background of the Study',1),('1.2 Statement of the Problem',2),('1.3 Objectives of the Study',2),('1.4 Significance of the Study',3),('1.5 Scope and Limitations',3),('1.6 Definition of Terms',4),('Chapter 2 REVIEW OF RELATED LITERATURE',5),('2.1 Interactive Simulations in Computing Education',5),('2.2 Multimedia Learning and Visual Explanations',5),('2.3 AI-Supported Learning',6),('2.4 Gamification and Learner Engagement',6),('2.5 Web-Based and Mobile Learning Access',6),('2.6 Synthesis and Research Gap',7),('Chapter 3 THEORETICAL AND CONCEPTUAL FRAMEWORK',8),('3.1 Theoretical Framework',8),('3.2 Conceptual Framework',8),('3.3 System Specification',9),('3.3.1 System Architecture',10),('3.3.2 Deployment Topology',11),('3.3.3 Development Tools and Technologies',12),('3.3.4 Functional Components',13),('3.3.5 Software Requirements',14),('3.3.6 Security and Data Privacy',15),('3.3.7 Use Case Diagram',16),('3.3.8 Use Case Relationships',17),('3.3.9 Learner Study Activity',20),('3.3.10 Protected Progress Request Sequence',23),('3.3.11 Conceptual Data Model',25),('3.3.12 Class Diagram',26),('3.3.13 System Design',27),('Chapter 4 RESEARCH METHODOLOGY',29),('4.1 Research Design',29),('4.2 Research Respondents',29),('4.3 Research Instruments and Tools',30),('4.4 Research Implementation (SDLC Phases)',30),('4.4.1 Requirement Gathering',31),('4.4.2 System Design',34),('4.4.3 Development',34),('4.4.4 Testing',35),('4.4.5 Deployment',36),('4.4.6 Review',37),('4.5 Research Deployment (System Testing and User Acceptance)',37),('4.6 Feasibility Analysis',38),('4.6.1 Technical Feasibility',38),('4.6.2 Organizational Feasibility',39),('4.6.3 Economic Feasibility',40),('Chapter 5 RESULTS AND DISCUSSION',41),('5.1 Learner Experience and Study Tools',41),('5.2 Pengu Study Aids and Feedback',43),('5.3 Interactive Operating-Systems Practice',47),('5.4 Classroom and Instructor Workflows',49),('5.5 Engagement and Administrative Tools',51),('5.6 Discussion and Evidence Limitations',55),('References',57)]
    for title,page in toc:
        p=doc.add_paragraph(); p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.left_indent=Inches(.15 if title[0].isdigit() else 0); p.paragraph_format.line_spacing=1.0; p.paragraph_format.space_after=Pt(0); p.paragraph_format.tab_stops.add_tab_stop(Inches(6.35),WD_TAB_ALIGNMENT.RIGHT,WD_TAB_LEADER.DOTS)
        r=p.add_run(title+'\t'+str(page)); r.font.name='Times New Roman'; r.font.size=Pt(10.5)
    doc.add_page_break()
    p=doc.add_paragraph('LIST OF FIGURES'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0)
    for r in p.runs: r.bold=True; r.font.size=Pt(14)
    figure_titles=[("Input-Process-Output Model of Odyssey",9),("Odyssey System Architecture",10),("Odyssey Deployment Topology",11),("Main Use Case Diagram of Odyssey",16),("Use Case Relationship Diagram 1: Account Access and Profile",17),("Use Case Relationship Diagram 2: Module Study and Progress",18),("Use Case Relationship Diagram 3: Pengu and Study Aids",18),("Use Case Relationship Diagram 4: Classroom and Quiz",19),("Use Case Relationship Diagram 5: Administration",20),("Activity Diagram 1: Learner Study",21),("Activity Diagram 2: Classroom Quiz Attempt",22),("Activity Diagram 3: Professor Creates and Publishes a Quiz",22),("Sequence Diagram 1: Protected Progress Request",23),("Sequence Diagram 2: Classroom Quiz Submission",24),("Sequence Diagram 3: AI Study-Aid Request",24),("Odyssey Conceptual Entity-Relationship Diagram",25),("Class Diagram of Odyssey Accounts and Classrooms",26),("Low-Level System Design of Odyssey",27),("Agile Software Development Cycle",30),("Odyssey home screen and study options",42),("Module route and learning progress",43),("PDF source and Pengu study options",44),("Flashcard question state",45),("Flashcard answer state",46),("Quick Check question and feedback",47),("System Call Tracer interface",48),("My Classrooms and class-joining interface",49),("Classroom modules and displayed progress",50),("Instructor application opening screen",51),("Odyssey learner XP leaderboard",52),("Administrator overview statistics",53),("Administrator user management",54),("Administrator classroom management",55)]
    for i,(t,page) in enumerate(figure_titles,1):
        p=doc.add_paragraph(f'Figure {i}. {t}\t{page}'); p.paragraph_format.first_line_indent=Inches(0); p.paragraph_format.line_spacing=1.0; p.paragraph_format.space_after=Pt(1); p.paragraph_format.tab_stops.add_tab_stop(Inches(6.35),WD_TAB_ALIGNMENT.RIGHT,WD_TAB_LEADER.DOTS)
        for r in p.runs: r.font.name='Times New Roman'; r.font.size=Pt(10.5)
    doc.add_page_break()
    p=doc.add_paragraph('LIST OF TABLES'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Inches(0)
    for r in p.runs: r.bold=True; r.font.size=Pt(14)
    for t,page in [('Table 1. Development Technology Stack',12),('Table 2. Software Requirements',14),('Table 3. Security and Data Privacy Measures',15),('Table 4. Functional Requirements',32),('Table 5. Non-Functional Requirements',33),('Table 6. Planned Verification',35),('Table 7. Economic Feasibility Assessment',40)]:
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
    add_body(doc,"As shown in Figure 1, the input stage consists of the learner and instructor accounts, lesson and study materials, simulation choices, classroom information, and available progress records. These inputs represent the people, content, and context that Odyssey uses to provide its learning and classroom functions.")
    add_body(doc,"The process stage covers how Odyssey presents lessons, runs interactive operating-systems simulations, creates study aids, delivers quizzes and flashcards, manages classroom activities, and records selected progress. These activities are handled by the client and, where required, the backend API and connected data or AI services.")
    add_body(doc,"The output stage includes access to an expandable learning platform, visible simulation traces, study feedback, learner progress summaries, instructor-managed activities, and administrative views. The diagram summarizes the platform's intended information flow; it does not mean every activity is stored on the server. Some selected preferences and learning activity remain in browser storage, and the model does not claim measured learning outcomes.")
    section(doc,'3.3 System Specification')
    add_body(doc,"This section describes Odyssey's documented architecture, deployment arrangement, user roles, representative learner workflows, conceptual data relationships, and development technology stack. The diagrams summarize system structure and interactions at a high level; they are not deployment-health or performance test results.")
    section(doc,'3.3.1 System Architecture',3)
    add_body(doc,"The browser presentation layer contains static pages, lessons, simulations, profiles, classroom tools, and the installable PWA shell. FastAPI provides API routes, middleware, authentication and role checks, protected data operations, and AI request handling. Supabase provides authentication and PostgreSQL with Row Level Security. AI requests pass through the backend to the configured provider so credentials are not placed in browser code. Browser storage and the service-worker cache support selected local preferences and static assets.")
    add_figure(doc,figs['architecture'],'Figure 2. Odyssey System Architecture')
    section(doc,'3.3.2 Deployment Topology',3)
    add_body(doc,"Repository configuration targets Vercel for static web content and Render for the Python API. Supabase provides hosted authentication and PostgreSQL; configured AI requests use an external AI service. Browsers communicate with these hosted components over HTTPS. This is a configuration-level topology and does not verify active production health, service plans, complete secrets, or network policy.")
    add_figure(doc,figs['deployment'],'Figure 3. Odyssey Deployment Topology')
    section(doc,'3.3.3 Development Tools and Technologies',3)
    add_body(doc,"The technologies used to develop and operate Odyssey are summarized in Table 1. The table separates the web client, backend, data services, AI integration, and deployment targets so the role of each part is clear.")
    tech=[("Web client","HTML, CSS, JavaScript","Lessons, simulations, profiles, classrooms, study tools, and PWA behavior."),("Backend API","Python 3.10 or newer, FastAPI, Uvicorn","API routing, validation, role-aware operations, and AI request mediation."),("Authentication and data","Supabase Auth, PostgreSQL, Row Level Security","Identity, relational data, and database access policies."),("AI study support","Configured external AI provider via backend","Chatbot responses and quiz or flashcard generation."),("Deployment targets","Vercel, Render, Supabase","Static frontend, Python API, identity, and database services."),("Browser capabilities","Web manifest, service worker, local storage","Installable app shell, static caching, and selected local learning state.")]
    add_caption(doc,'Table 1. Development Technology Stack')
    add_table(doc,['Component','Technology','Role in the system'],tech,widths=[1.45,2.0,3.05])
    add_body(doc,"The browser client provides learner, professor, and administrator interfaces. FastAPI mediates protected operations and external AI requests, while the Supabase platform provides the PostgreSQL database and authentication services. Vercel and Render are the repository's configured deployment targets; this documentation does not verify that a live deployment is active.")
    section(doc,'3.3.4 Functional Components',3)
    add_body(doc,"Odyssey is organized into functional components that serve learner, professor, and administrator workflows. Together, these components connect lesson access, interactive practice, classroom activity, and platform oversight.")
    components=[
      ('Account and profile management','Supports registration or sign-in, role-aware access, profile information, and account preferences.'),
      ('Explore Lessons and simulations','Presents operating-systems modules and browser-based activities that let learners inspect selected algorithm states.'),
      ('Study aids and Pengu','Provides supported PDF study, flashcards, quizzes, and AI-assisted explanations through the configured backend workflow.'),
      ('Progress and engagement','Displays supported completion records, XP, streaks, badges, and leaderboard information.'),
      ('Classroom and learning materials','Allows professors to manage classroom membership and publish modules for enrolled learners.'),
      ('Classroom quizzes','Supports quiz authoring, publication, student attempts, answer submission, and saved results.'),
      ('Administration','Provides supported user and role management, instructor-application review, classroom oversight, statistics, and audit views.')]
    for i,(name,description) in enumerate(components,1):
        p=doc.add_paragraph(); p.paragraph_format.left_indent=Inches(.3); p.paragraph_format.first_line_indent=Inches(-.25); p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY; p.paragraph_format.line_spacing=1.35; p.paragraph_format.space_after=Pt(5)
        r=p.add_run(f'{i}. {name} – '); r.bold=True; p.add_run(description)
    section(doc,'3.3.5 Software Requirements',3)
    add_body(doc,"The software environment required to access, develop, and operate Odyssey is summarized in Table 2. The platform is delivered through a modern browser and optional PWA installation; it is not documented as a native Android-only application.")
    software=[
      ("Client device and browser","A current browser with JavaScript enabled. PWA installation and local caching depend on browser support."),
      ("Web client","HTML, CSS, and JavaScript files served as the browser interface."),
      ("Backend runtime","Python 3.10 or newer with FastAPI and Uvicorn for API services."),
      ("Authentication and database","A configured Supabase project using Supabase Auth and PostgreSQL; Row Level Security policies govern protected records."),
      ("AI study service","A configured external AI provider and server-side credentials for supported chatbot and study-aid requests."),
      ("Network connection","Required for hosted API, authentication, database, classroom, and AI functions. Cached static assets alone do not provide these services offline."),
      ("Hosting targets","Vercel for the static client and Render for the Python API, as specified in repository configuration.")]
    add_caption(doc,'Table 2. Software Requirements for Odyssey')
    add_table(doc,['Software component','Requirement or purpose'],software,widths=[1.75,4.75])
    add_body(doc,"These requirements distinguish browser access from the hosted services the application calls. The PWA shell can cache selected assets, but accounts, database records, classroom operations, and AI requests depend on configured network services. Specific browser versions, service plans, and production environment values must be confirmed for the target deployment.")
    section(doc,'3.3.6 Security and Data Privacy',3)
    add_body(doc,"Odyssey handles account, profile, progress, and classroom information. The security and privacy measures summarized in Table 3 describe the controls and safeguards associated with these workflows. They are design and implementation considerations, not a claim of completed security certification or legal compliance.")
    security=[
      ("Authentication","Use Supabase Auth for account sign-in and require verified identity for protected API operations."),
      ("Role-based access","Apply role checks to instructor and administrator routes so each role receives only its supported functions."),
      ("Database access","Use PostgreSQL Row Level Security policies to restrict protected records according to the authenticated user and classroom role."),
      ("Credential handling","Keep passwords under the authentication provider's management and do not store plain-text passwords in Odyssey profile records."),
      ("Input validation","Validate request data and reject incomplete or invalid submissions before processing or saving them."),
      ("AI provider secrets","Keep provider credentials in server-side configuration; do not place API keys in browser code."),
      ("Personal data","Limit access to account, progress, and classroom data to the workflows that need it, and avoid including direct identifiers in AI prompts unless required.")]
    add_caption(doc,'Table 3. Security and Data Privacy Measures')
    add_table(doc,['Security aspect','Odyssey measure'],security,widths=[1.55,4.95])
    add_body(doc,"Supabase Auth, API role checks, and database policies form separate protection layers. Request validation helps prevent malformed data from entering a workflow, while server-side AI credentials keep provider secrets out of the client. Privacy safeguards should be reviewed against the actual deployed policies, data-retention practices, and applicable institutional rules before production use.")
    section(doc,'3.3.7 Use Case Diagram',3)
    add_body(doc,"The use case model identifies the three human roles supported by the application: Student, Professor, and Administrator. Students study modules, use simulations and study tools, review progress, and participate in classroom activities. Professors create classrooms and learning activities. Administrators manage platform accounts and review platform-level records. Supabase and the AI provider are shown as technical services in the architecture and sequence models rather than as human actors.")
    add_figure(doc,figs['use-case'],'Figure 4. Main Use Case Diagram of Odyssey')
    add_body(doc,"The diagram groups related functions so the system boundary stays readable. The role associations show who initiates each function; they do not imply that a user can bypass the API authorization checks. The following relationship diagrams expand the main use cases and show where one action includes another or can extend an optional path.")
    section(doc,'3.3.8 Use Case Relationships',3)
    add_body(doc,"In the relationship diagrams, «include» identifies a step required by the base use case, while «extend» identifies an optional or conditional path. The labels describe designed workflow relationships; they are not claims that the code implements UML use-case objects or formal workflow guarantees.")
    usecase_sets=[
      ('account','Figure 5. Use Case Relationship Diagram 1: Account Access and Profile',"The account workflow covers registration or sign-in, role verification for protected features, profile access, and password reset. The role check is part of the protected-access path. Password reset is an alternate account-recovery workflow rather than a step required during each sign-in."),
      ('learning','Figure 6. Use Case Relationship Diagram 2: Module Study and Progress',"The learning workflow starts with module and lesson access. A learner may extend study with a simulation or quiz. Progress recording applies to supported completion workflows; ordinary lesson navigation and local activity do not necessarily create a server request."),
      ('study-aids','Figure 7. Use Case Relationship Diagram 3: Pengu and Study Aids',"The study-aid workflow uses uploaded or selected material where that feature requires it. PDF quiz generation and flashcard creation depend on readable source content. Pengu explanations are an optional AI request mediated by the backend; the provider credentials remain server-side."),
      ('classroom','Figure 8. Use Case Relationship Diagram 4: Classroom and Quiz',"Professors create or maintain classroom content and publish quizzes for enrolled students. Students join a classroom with an invitation code, view published material, submit quiz answers, and receive the saved attempt result. Drafts are not presented to students as published quizzes."),
      ('administration','Figure 9. Use Case Relationship Diagram 5: Administration',"The administrative workflow includes searching accounts, changing supported roles, reviewing instructor applications, overseeing classrooms, and consulting statistics or audit events. These operations are restricted to administrator routes; the diagram represents their functional grouping rather than screen-by-screen navigation.")]
    for key,caption,explanation in usecase_sets:
        add_figure(doc,figs['usecase-'+key],caption,width=6.0)
        add_body(doc,explanation)
    section(doc,'3.3.9 Learner Study Activity',3)
    add_body(doc,"The activity models show the ordered steps and decisions in three common workflows. The learner study path branches between practice and explanation review. The classroom quiz path separates answering from final submission and saving a score. The professor path distinguishes saving a draft from publishing content to enrolled students.")
    add_figure(doc,figs['activity'],'Figure 10. Activity Diagram 1: Learner Study')
    add_body(doc,"The learner study activity begins when a student opens Explore Lessons, selects a module or topic, and reads the lesson. The student may run a simulation or quiz, or review the explanation, before marking the topic complete. The diagram shows the user-facing decision; it does not imply that every topic completion is synchronized to the server.")
    add_figure(doc,figs['activity-classroom'],'Figure 11. Activity Diagram 2: Classroom Quiz Attempt')
    add_body(doc,"For a classroom quiz, a student opens a published quiz, starts an attempt, and answers available questions. The student can return to review unanswered items before submission. On submission, the backend validates the attempt and saves the result for the classroom workflow.")
    add_figure(doc,figs['activity-instructor'],'Figure 12. Activity Diagram 3: Professor Creates and Publishes a Quiz')
    add_body(doc,"The professor activity shows the content-authoring path from sign-in through classroom selection and quiz preparation. A professor can retain an item as a draft or publish it for enrolled students. Publication is the point at which the student-facing attempt path becomes available, subject to the system's classroom permissions.")
    section(doc,'3.3.10 Protected Progress Request Sequence',3)
    add_body(doc,"The sequence diagrams describe representative messages between a person, the browser, FastAPI, and connected services. The protected progress sequence shows a supported completion request; separate diagrams show classroom quiz submission and AI study-aid generation. These are design-level traces derived from the API and router boundaries, not captured network logs.")
    add_figure(doc,figs['sequence'],'Figure 13. Sequence Diagram 1: Protected Progress Request')
    add_body(doc,"The browser sends a supported progress request with the authenticated user's access token. FastAPI validates identity and the operation before using its configured Supabase client to persist the result. The response returns to the browser for user feedback. This sequence does not assert that every lesson action or simulation step is persisted remotely.")
    add_figure(doc,figs['sequence-quiz'],'Figure 14. Sequence Diagram 2: Classroom Quiz Submission')
    add_body(doc,"The classroom quiz sequence checks that the student can access the published classroom activity, then submits the answers to the API. The API validates and records the attempt and score using the configured database client before returning the result. It summarizes the protected service flow, not a test trace from a live deployment.")
    add_figure(doc,figs['sequence-ai'],'Figure 15. Sequence Diagram 3: AI Study-Aid Request')
    add_body(doc,"The AI study-aid sequence shows the client sending a validated request to FastAPI, which calls the configured AI service using server-side credentials. Generated content returns through the API to the browser for display. This keeps provider credentials out of the client and distinguishes the external model from Odyssey's own application logic.")
    section(doc,'3.3.11 Conceptual Data Model',3)
    add_body(doc,"The conceptual data model is grounded in the Supabase schema and classroom migrations. A Supabase Auth user has a matching profile row identified by the same UUID. Professors own classrooms; students are linked through classroom memberships. Classrooms contain modules and quizzes, quizzes contain questions, and quiz attempts connect a student with a quiz and its submitted answers or score. The model focuses on persistent entities and relationships, while browser-only preferences and cached files remain outside it.")
    add_figure(doc,figs['conceptual-erd'],'Figure 16. Odyssey Conceptual Entity-Relationship Diagram')
    add_body(doc,"The data model is a design summary rather than a complete database export. Its keys and multiplicities follow the documented schema: each membership refers to one classroom and one profile; a classroom may contain many modules and quizzes; a quiz may contain many questions and attempts. Exact constraints, policies, and optional fields remain defined by the SQL schema and migrations.")
    section(doc,'3.3.12 Class Diagram',3)
    add_body(doc,"The class diagram presents the main persistent domain classes, attributes, and representative operations used by Odyssey's account and classroom workflows. Supabase Auth manages sign-in identity, while Profile stores the application's role, XP, and progress fields. Classroom quiz classes follow the classroom migration schema.")
    add_figure(doc,figs['class-diagram'],'Figure 17. Class Diagram of Odyssey Accounts and Classrooms')
    add_body(doc,"The operations in the diagram summarize responsibilities visible in the API rather than methods declared by one shared object-oriented model. The web client and FastAPI use route handlers and service functions; this diagram documents their domain responsibilities and persistent relationships without claiming a single in-memory class implementation.")
    section(doc,'3.3.13 System Design',3)
    add_body(doc,"The system design view connects the screens used by each role to FastAPI routes, backend services, persistence, and external or browser-managed resources. It separates the functional components that support lessons, study aids, progress, classrooms, and administration. The view is more detailed than the high-level layer diagram and identifies where access checks, sanitization, rate limiting, and audit logging belong in the request path.")
    add_figure(doc,figs['system-design'],'Figure 18. Low-Level System Design of Odyssey')
    add_body(doc,"Student, professor, and administrator pages call the API for protected operations. FastAPI routes apply authentication and role checks, validate inputs, and use backend services to access Supabase or the configured AI provider. Selected preferences and static assets can remain in browser storage or the service-worker cache; this does not make hosted identity, database, or AI functions available offline.")

    # CHAPTER 4: follow the LL document's research-methodology sequence while
    # retaining Odyssey-specific requirements, system facts, and feasibility analysis.
    chapter(doc,4,'Research Methodology')
    section(doc,'4.1 Research Design')
    add_body(doc,"This study uses a system-development research design to document and assess Odyssey, an expandable learning platform for operating-systems topics. The descriptive work identifies the platform's users, functions, and technical boundaries. The developmental work organizes requirements, system models, implementation activities, and verification. This chapter describes the method and proposed evaluation; it does not report participant findings, measured learning outcomes, or completed user-acceptance results.")
    add_body(doc,"The development approach is iterative. Each feature is considered against its user workflow and technical dependencies, implemented in the appropriate client or backend component, and reviewed against its requirements. Any formal evaluation involving people must be conducted only after the respondent group, instrument, consent process, and data-handling procedure have been approved.")
    section(doc,'4.2 Research Respondents')
    add_body(doc,"The platform's intended user roles are learners, instructors, and administrators. If a user evaluation is conducted, these roles provide the relevant perspectives: learners can assess lesson, simulation, study-aid, and progress workflows; instructors can assess classroom and quiz functions; and administrators can assess user, classroom, and platform-management functions. The available project records do not specify an approved respondent count, institution, sampling frame, or recruitment schedule. Those details must be established with the research adviser before data collection; no participant results are claimed in this document.")
    section(doc,'4.3 Research Instruments and Tools')
    add_body(doc,"System documentation and verification use the requirements tables, diagrams, repository configuration, and application workflows described in Chapter 3. A requirement-based checklist can record whether each expected function and role restriction behaves as specified. For a later usability study, the researchers should select and obtain approval for a suitable questionnaire, task procedure, and scoring method before inviting participants. No completed survey instrument, response dataset, or validated usability score was supplied for this document.")
    add_body(doc,"The implementation tools identified in the project include the browser client, FastAPI backend, Supabase Auth and PostgreSQL services, and the configured AI provider. UML diagrams document structure and behavior. The development environment and deployment services are described in Chapter 3; their presence does not by itself establish testing or evaluation results.")
    section(doc,'4.4 Research Implementation (SDLC Phases)')
    add_body(doc,"Odyssey's development process is organized as an iterative software development life cycle. The Agile cycle is summarized in Figure 19. Requirements, design, development, testing, deployment, and review may recur as features are refined; the diagram represents the documented development approach rather than a dated project log.")
    add_figure(doc,figs['agile-cycle'],'Figure 19. Agile Software Development Cycle',width=4.6)
    add_body(doc,"The cycle supports incremental work across lessons, simulations, study aids, progress, classroom, administration, and AI functions. The project records do not establish specific sprint dates, team ceremonies, or stakeholder-review events, so none are reported here.")
    section(doc,'4.4.1 Requirement Gathering',3)
    add_body(doc,"Requirements were organized from the documented Odyssey workflows and implementation boundaries. They cover account access and profiles, lesson and simulation activities, study aids and progress, classroom and quiz operations, AI-assisted study functions, and administration. The functional and non-functional requirements below summarize expected system behavior and quality constraints; they are not test results.")
    fr=[("FR-01","The system shall support account registration, sign-in, sign-out, and password-reset requests through its authentication service."),("FR-02","The system shall allow an authenticated user to retrieve and update that user's profile."),("FR-03","The system shall validate Supabase access tokens and apply role checks to protected API operations where required."),("FR-04","The system shall display available learning modules and topic content."),("FR-05","The system shall provide interactive educational simulations for supported operating-systems concepts, including scheduling, memory, processes, threads, file systems, deadlocks, disks, system calls, and boot topics."),("FR-06","The system shall allow learners to select or enter scenario inputs and inspect simulation traces or results."),("FR-07","The system shall provide quiz, flashcard, and PDF study workflows in the web client."),("FR-08","The system shall provide learner progress summaries and module-completion workflows through supported progress operations."),("FR-09","The system shall support XP, streak, badge, profile, statistics, and leaderboard workflows where implemented."),("FR-10","The system shall retain selected preferences and local learning activity in browser storage where implemented."),("FR-11","The system shall provide a general-purpose AI chatbot and AI workflows that generate quizzes and flashcards from supported materials."),("FR-12","The system shall keep AI provider credentials in backend configuration and return generated study content or chatbot responses to the client."),("FR-13","The system shall allow authorized instructors to create and manage classrooms and memberships."),("FR-14","The system shall allow instructors to manage classroom modules and quizzes, including questions and submissions."),("FR-15","The system shall allow authorized administrators to manage supported user records and roles, review instructor applications, inspect statistics and audit entries, and manage classrooms.")]
    add_caption(doc,'Table 4. Functional Requirements')
    add_table(doc,['ID','Functional requirement'],fr,widths=[1.0,5.5])
    nfr=[("NFR-01 Security","Protected API routes shall validate identity and roles; database Row Level Security shall restrict data access."),("NFR-02 Transport","Hosted deployment shall use HTTPS, configured CORS allow-lists, security headers, and request-size limits."),("NFR-03 Abuse resistance","Configured global, authentication, and API rate limits shall be applied; multi-instance deployments require shared rate-limit storage for consistent enforcement."),("NFR-04 Input handling","API inputs shall be validated and sanitized, and client errors shall not expose internal exceptions."),("NFR-05 Usability","Lessons and simulations shall present understandable controls and feedback on desktop and mobile layouts."),("NFR-06 Availability","The client and API depend on configured hosting and Supabase services; no availability target is documented."),("NFR-07 Maintainability","Client pages, API routers, middleware, and service integrations shall remain modular."),("NFR-08 Privacy","Account, progress, classroom, and administration data shall be protected through access policies and secure handling of secrets."),("NFR-09 Compatibility","The system shall support modern browsers and PWA installation where available; cached static files do not provide offline access to hosted services."),("NFR-10 Performance","No response-time or concurrency target is documented; a target should be set after measuring an agreed workload.")]
    add_caption(doc,'Table 5. Non-Functional Requirements')
    add_table(doc,['ID','Non-functional requirement'],nfr,widths=[1.5,5.0])
    section(doc,'4.4.2 System Design',3)
    add_body(doc,"System design translates the requirements into models of Odyssey's users, workflows, data, and service boundaries. The use-case, activity, sequence, conceptual-data, class, and low-level system-design diagrams in Chapter 3 provide these views. The architecture separates the browser interface from FastAPI routes, backend services, Supabase persistence, and external or browser-managed resources. Together, these models guide implementation and clarify where authentication, role checks, validation, and data policies apply.")
    section(doc,'4.4.3 Development',3)
    add_body(doc,"The documented platform combines a browser-based client with a FastAPI backend. Client pages provide lessons, simulations, study aids, learner progress, classrooms, quizzes, and administration. Backend routes and services handle protected operations, access checks, progress and classroom workflows, and requests to the configured AI provider. Supabase Auth and PostgreSQL support identity and persistent records. The codebase is organized into separate components so that a feature can be refined without treating browser-local preferences as server-side data.")
    section(doc,'4.4.4 Testing',3)
    add_body(doc,"The verification plan checks functional behavior, access boundaries, compatibility, and dependencies on hosted services. These checks remain planned; the project records supplied for this document do not include completed test logs or measured outcomes.")
    checks=[("Functional verification","Exercise account and profile workflows, lesson display, simulator inputs and traces, quizzes, flashcards, PDF study, progress, classroom operations, administration, and AI requests."),("Authorization and privacy review","Check token validation, role boundaries, Row Level Security policies, secret placement, input sanitization, CORS, security headers, and rate limiting."),("Compatibility and usability review","Inspect responsive behavior, keyboard operation, readable labels, feedback, and PWA installation on supported browsers and devices."),("Service and network checks","Verify configured deployment, health routes, database connectivity, AI-provider handling, offline app-shell caching, and graceful failure when live services are unavailable."),("User evaluation","After approval and participant procedures are defined, collect learner and instructor feedback using the selected usability instrument. Report sample sizes, instruments, conditions, and limitations."),("Operational measurement","Measure response times, concurrency, hosting and AI usage, support effort, and any agreed baseline before making reliability or cost claims.")]
    add_caption(doc,'Table 6. Planned Verification')
    add_table(doc,['Evaluation area','Planned verification'],checks,widths=[1.65,4.85])
    section(doc,'4.4.5 Deployment',3)
    add_body(doc,"Deployment prepares the browser client, API, database configuration, and external-service settings for the intended environment. The topology described in Chapter 3 distinguishes the client from the hosted application, Supabase data services, and the AI provider. A deployment requires valid environment settings, database migrations and access policies, allowed origins, service credentials, and network connectivity. The repository identifies deployment targets, but the presence of configuration does not establish that a production release has been completed or evaluated.")
    section(doc,'4.4.6 Review',3)
    add_body(doc,"Review compares implementation and verification evidence with the documented requirements. Findings can be used to refine interfaces, system behavior, access policies, and deployment configuration in a subsequent development cycle. Review records and approved changes should be retained for traceability. No formal stakeholder review minutes or completed evaluation findings were provided for this report.")
    section(doc,'4.5 Research Deployment (System Testing and User Acceptance)')
    add_body(doc,"A later research deployment should begin with functional and security verification in the approved test environment. Once the system is stable and the research procedures are authorized, intended users may complete defined tasks covering their relevant role workflows and provide feedback through the approved instrument. The evaluation protocol should identify the system build, task instructions, respondent criteria and count, consent process, data storage, scoring procedure, and acceptance criteria before data collection.")
    add_body(doc,"User-acceptance findings, usability scores, and learning outcomes are not included because no approved participant plan or evaluation records were supplied. Results and discussion should be added only after the study is conducted and its evidence is available.")
    section(doc,'4.6 Feasibility Analysis')
    section(doc,'4.6.1 Technical Feasibility',3)
    add_body(doc,"The repository contains a web client built with HTML, CSS, and JavaScript; a Python FastAPI service; Supabase Auth and PostgreSQL integrations; and route groups for authentication, profiles, progress, modules, statistics, administration, classrooms, AI, applications, and health. Middleware includes request identifiers, security headers, gzip, CORS, rate limiting, sanitization, and logging. The manifest and service worker support installability and caching of selected static files. Repository configuration describes Vercel and Render deployment targets [1]-[5].")
    add_body(doc,"Deployment requires valid Supabase settings, database policies and migrations, hosting environment variables, allowed origins, external AI credentials, and network access to hosted services. In-memory rate limiting is not shared across multiple API instances, and browser-local activity may not synchronize across devices. These constraints are technically addressable but require configuration and validation in the target environment.")
    section(doc,'4.6.2 Organizational Feasibility',3)
    add_body(doc,"The implementation uses common web and database technologies and separates the browser client from API and data responsibilities. Its route and page organization can support contributors with frontend, Python API, database, and deployment skills. Classroom workflows can support instruction when an adopting organization assigns roles and operating responsibilities.")
    add_body(doc,"The project records do not identify a sponsoring institution, deployment owner, support team, training plan, or approved operating policy. An adopter should assign responsibility for account administration, classroom setup, content review, privacy requests, incident response, and deployment secrets. Organizational feasibility therefore depends on local ownership and operational readiness.")
    section(doc,'4.6.3 Economic Feasibility',3)
    econ=[("Development effort","Source code is available; historical labor hours and labor rates are not recorded."),("Hosting and database","Configuration targets Vercel, Render, and Supabase. Actual plans, usage, paid tiers, and invoices were not provided."),("AI service","AI features depend on an external provider; usage volume, quotas, and charges are undocumented."),("Maintenance","Ongoing work includes updates, dependency maintenance, content review, security work, and support; no annual estimate is documented."),("Potential benefits","Centralized lessons, browser simulations, classroom quizzes, and progress workflows may reduce reliance on separate tools. Benefits have not been measured."),("ROI and payback","Cannot be calculated from available evidence. A calculation needs baseline costs and time, implementation and operating costs, measured savings or valued benefits, and a defined evaluation period.")]
    add_caption(doc,'Table 7. Economic Feasibility Assessment')
    add_table(doc,['Category','Evidence-based assessment'],econ,widths=[1.5,5.0])
    add_body(doc,"The project is economically plausible as a software product because it uses a static web client, common open-source components, and managed cloud services. Actual economic feasibility remains conditional on local usage, hosting and AI charges, labor, support, and measured value. The source records do not justify a numerical return-on-investment estimate.")

    # CHAPTER 5
    chapter(doc,5,'Results and Discussion')
    section(doc,'5.1 Learner Experience and Study Tools')
    add_body(doc,"The supplied interface screenshots show an Odyssey home screen with learner currency and streak indicators, a study upload option, and shortcuts to lessons and rankings. The learning-progress screen presents a four-module route, completion status, topic count, and a review action. These are the values and controls visible in the supplied captures; they are not a measurement of overall learner participation or achievement.")
    imgroot=Path(r'C:\Users\ADMIN\Downloads')
    screenshots=[
        ('893164572_4720374971529478_690920164102587946_n.jpg','Figure 20. Odyssey home screen and study options'),
        ('891892893_29566242113011484_2981868727649773868_n.jpg','Figure 21. Module route and learning progress'),
    ]
    for name,caption in screenshots: add_figure(doc,imgroot/name,caption,width=3.0)
    section(doc,'5.2 Pengu Study Aids and Feedback')
    add_body(doc,"The screenshots document multiple study modes tied to learner-provided material. The PDF study screen identifies Module 5 as its source and offers memorization, challenge, and question-and-answer options. The flashcard screens show a prompt followed by its revealed explanation. The Quick Check screen shows a multiple-choice question and explanatory feedback. These images illustrate interface states and the displayed example content; they do not establish quiz accuracy across a question bank or improvement in retention.")
    screenshots=[
        ('893937455_4260671834230473_7582237102329824428_n.jpg','Figure 22. PDF source and Pengu study options'),
        ('846908336_2396804114423632_2536424537032601924_n.jpg','Figure 23. Flashcard question state'),
        ('894687997_994107373752824_7166438679690070924_n.jpg','Figure 24. Flashcard answer state'),
        ('892724062_1521019000087167_829268459393699876_n.jpg','Figure 25. Quick Check question and feedback'),
    ]
    for name,caption in screenshots: add_figure(doc,imgroot/name,caption,width=3.0)
    section(doc,'5.3 Interactive Operating-Systems Practice')
    add_body(doc,"The System Call Tracer screenshot presents a program-selection control, execution and clear actions, a step-by-step option, and a next-step control. It documents the lab interface for exploring transitions between user and kernel mode. The supplied image does not show a completed execution trace, so no specific system-call output or runtime result is reported here.")
    add_figure(doc,imgroot/'896655243_1114549514531947_6299618814024409947_n.jpg','Figure 26. System Call Tracer interface',width=3.0)
    section(doc,'5.4 Classroom and Instructor Workflows')
    add_body(doc,"The classroom screenshots show a join-code field and a listed BSCS 3A classroom, followed by a classroom detail page with module and resource navigation, class options, a progress display, and a quiz-review action. A separate instructor-application screen shows the opening decision step. These captures document selected learner and instructor-facing workflows; they do not show a completed application or verify that all classroom actions succeeded.")
    screenshots=[
        ('891004360_2082420872435367_1061858712284001231_n.jpg','Figure 27. My Classrooms and class-joining interface'),
        ('897806037_1286230080362837_5115162308474805406_n.jpg','Figure 28. Classroom modules and displayed progress'),
        ('892947122_1680167570137318_782324479888283757_n.jpg','Figure 29. Instructor application opening screen'),
    ]
    for name,caption in screenshots: add_figure(doc,imgroot/name,caption,width=3.0)
    section(doc,'5.5 Engagement and Administrative Tools')
    add_body(doc,"The leaderboard screen ranks learners by XP and includes a badges view. The administrator overview displays account, role, classroom, and average-XP totals, while the users and classrooms screens show management lists. Counts and names shown in these images reflect the captured interface at that moment and should not be treated as current operational totals or independently audited records.")
    screenshots=[
        ('898502143_29240216642275866_2505916340822816561_n.jpg','Figure 30. Odyssey learner XP leaderboard'),
        ('901940049_1824881148723738_3061244640033481772_n.jpg','Figure 31. Administrator overview statistics'),
        ('899191427_1000942336397698_6775760069325836039_n.jpg','Figure 32. Administrator user management'),
        ('896655354_1675112450837288_5128266301442765138_n.jpg','Figure 33. Administrator classroom management'),
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
    diagrams={}
    prebuilt={'activity','sequence','usecase-account','usecase-learning','usecase-study-aids','usecase-classroom','usecase-administration','activity-classroom','activity-instructor','sequence-quiz','sequence-ai'}
    for name,fn,size in make_diagrams():
        diagrams[name]=fn(None,size) if name in prebuilt else save(name,fn,size)
    make_doc(diagrams)
