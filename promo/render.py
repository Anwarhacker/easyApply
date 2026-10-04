"""Render the easyApply Reel locally. All demo details are fictional."""
from pathlib import Path
import math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
W,H,FPS,DURATION = 1080,1920,30,24
BG = '#071e24'
INK = '#f3fbf9'
MUTED = '#91b9bd'
TEAL = '#5eead4'
def font(n,bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/'+('segoeuib.ttf' if bold else 'segoeui.ttf'),n)
fonts = {(n,b):font(n,b) for n in [24,28,30,32,34,36,40,44,48,54,60,64,76,84,92,100] for b in [False,True]}
logo=Image.open(ROOT.parent/'public/icons/icon-128.png').convert('RGBA').resize((72,72))
def text(d,xy,s,n=36,c=INK,b=False): d.text(xy,s,font=fonts[n,b],fill=c)
def box(d,r,fill='#10333b',outline=None,radius=28): d.rounded_rectangle(r,radius,fill,outline,width=2)
def tick(d,x,y,c=TEAL): d.line([(x,y+12),(x+10,y+23),(x+30,y)],fill=c,width=6)
def button(d,y,label,w=792):
    box(d,(104,y,104+w,y+94),TEAL)
    text(d,(132,y+18),label,36,'#073b39',True)
def row(d,y,title,value,checked=False):
    box(d,(104,y,896,y+126),'#163b43')
    text(d,(130,y+16),title,28,MUTED)
    text(d,(130,y+57),value,36,INK,True)
    if checked: tick(d,831,y+57)
def heading(d,lines):
    for i,s in enumerate(lines): text(d,(86,300+i*109),s,92,INK,True)
def card(d,title):
    box(d,(78,635,922,1430),'#0e2c34','#2b5058',36)
    text(d,(108,669),title,34,TEAL,True)
    d.line((108,734,892,734),fill='#2b5058',width=2)

def scene(idx,t):
    im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im)
    # Restrained moving background lines keep attention on the message.
    for k in range(5):
        x=int(-350+k*360+25*math.sin(t*.7+k))
        d.line((x,0,x+600,H),fill='#0c2b33',width=2)
    im.paste(logo,(86,154),logo)
    text(d,(174,158),'easyApply',48,INK,True)
    text(d,(86,252),'LESS REPETITION. MORE OPPORTUNITY.',24,TEAL,True)
    if idx==0:
        heading(d,['Same details.', 'Every application?'])
        # Layered application cards suggest repeated work.
        box(d,(116,617,950,1380),'#102e36','#23434c')
        card(d,'JOB APPLICATION')
        progress=min(1,t/1.7)
        row(d,777,'Full name','Asha Rao'[:int(8*progress)])
        row(d,926,'Email','asha@example.com'[:int(16*progress)])
        row(d,1075,'Skills','React, TypeScript'[:int(17*progress)])
        text(d,(130,1258),'Type. Repeat. Repeat.',40,MUTED,True)
        text(d,(86,1502),'Make the next one easier.',44,TEAL,True)
    elif idx==1:
        heading(d,['Save once.', 'Stay ready.'])
        card(d,'YOUR JOB PROFILES')
        for j,(title,sub) in enumerate([('Frontend Developer','React • TypeScript • UI'),('Java Developer','Java • Spring • SQL'),('DevOps Engineer','Linux • Docker • CI/CD')]):
            y=777+j*177
            box(d,(104,y,896,y+150),'#173f46',TEAL if j==0 else '#30535b')
            text(d,(132,y+24),title,40,INK,True)
            text(d,(132,y+85),sub,30,MUTED)
        text(d,(130,1334),'One profile for each direction.',32,TEAL)
        text(d,(86,1502),'Your details, together.',44,TEAL,True)
    elif idx==2:
        heading(d,['Scan. Review.', 'Then fill.'])
        card(d,'REVIEW YOUR MATCHES')
        for j,(a,b) in enumerate([('Full name','Asha Rao'),('Email','asha@example.com'),('Skills','React, TypeScript')]):
            row(d,777+j*146,a,b,t>0.5+j*.35)
        button(d,1260,'Fill selected fields  →')
        text(d,(86,1502),'You choose what gets filled.',44,TEAL,True)
        text(d,(86,1570),'Never submits applications for you.',32,MUTED)
    elif idx==3:
        heading(d,['Your info.', 'One click away.'])
        card(d,'SAVED INFO')
        row(d,777,'Interview availability','Weekdays after 5 PM')
        row(d,932,'Portfolio','example.com/asha')
        button(d,1100,'Copied!' if t>1.4 else 'Copy value')
        box(d,(104,1220,480,1330),'#173f46','#3b6570')
        box(d,(506,1220,896,1330),'#173f46','#3b6570')
        text(d,(130,1250),'+ Add entry',34,INK,True)
        text(d,(532,1250),'Download .txt',34,INK,True)
        text(d,(86,1502),'Add any application note.',44,TEAL,True)
        text(d,(86,1570),'Save a title + value. Copy when needed.',32,MUTED)
    elif idx==4:
        heading(d,['Track progress.', 'Keep control.'])
        card(d,'APPLICATION TRACKER')
        row(d,777,'Northstar Studio • Frontend','Applied',True)
        row(d,936,'Orbit Labs • Java Developer','Interview',True)
        box(d,(104,1116,896,1380),'#133d43','#2f6269')
        text(d,(132,1146),'Stored in your Chrome profile',34,TEAL,True)
        text(d,(132,1210),'PAN / Aadhaar: encrypted vault',32,INK)
        text(d,(132,1266),'Manual uploads. You submit.',32,INK)
        text(d,(86,1502),'Less admin. More focus.',44,TEAL,True)
    else:
        heading(d,['Your next role.', 'Less repetition.'])
        big=logo.resize((210,210)); im.paste(big,(435,695),big)
        text(d,(290,960),'easyApply',100,INK,True)
        text(d,(190,1125),'Built for students & graduates.',44,MUTED)
        button(d,1270,'Save this for your next application')
        text(d,(86,1502),'A Chrome extension for job seekers.',40,TEAL,True)
    text(d,(86,1694),'CHROME EXTENSION',24,MUTED,True)
    text(d,(86,1734),'Illustrative demo • Fictional application details',24,MUTED)
    for j in range(6): box(d,(86+j*140,1650,206+j*140,1656),TEAL if j<=idx else '#24454d',radius=3)
    # Quick dip transition and slight entrance motion.
    ease=1-(1-min(1,t/.45))**3
    if ease<1:
        moved=Image.new('RGB',(W,H),BG); moved.paste(im,(0,int((1-ease)*45))); im=moved
    fade=min(1,t/.18,(4-t)/.18)
    if fade<1: im=Image.blend(Image.new('RGB',(W,H),BG),im,max(0,fade))
    return im

def music():
    sr=44100; a=np.zeros(sr*DURATION,dtype=np.float64); rng=np.random.default_rng(41)
    def add(start,v):
        p=int(start*sr); n=min(len(v),len(a)-p)
        if n>0:a[p:p+n]+=v[:n]
    chords=[(220,261.63,329.63),(174.61,220,261.63),(130.81,164.81,196),(196,246.94,293.66)]
    for beat in range(48):
        start=beat*.5
        t=np.arange(int(sr*.28))/sr
        add(start,.34*np.sin(2*np.pi*(52*t+6*(1-np.exp(-t*30))))*np.exp(-t*18))
        for off in [0,.25]:
            t=np.arange(int(sr*.07))/sr
            add(start+off,.035*rng.normal(size=len(t))*np.exp(-t*70))
        if beat%2:
            t=np.arange(int(sr*.15))/sr
            add(start,.055*rng.normal(size=len(t))*np.exp(-t*25))
        chord=chords[(beat//4)%4]; freq=chord[beat%3]*2
        t=np.arange(int(sr*.42))/sr
        add(start,.085*(np.sin(2*np.pi*freq*t)+.2*np.sin(4*np.pi*freq*t))*np.exp(-t*7)*np.minimum(1,t/.012))
    a*=np.minimum(1,np.arange(len(a))/sr)*np.minimum(1,(len(a)-np.arange(len(a)))/sr/1.5)
    a=np.int16(np.clip(a,-.95,.95)*32767)
    with wave.open(str(ROOT/'original-beat.wav'),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(sr);out.writeframes(a.tobytes())

if __name__=='__main__':
    music()
    cmd=['ffmpeg','-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(ROOT/'original-beat.wav'),'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(ROOT/'easyApply-reel.mp4')]
    with open(ROOT/'render.log','w') as log:
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        for f in range(DURATION*FPS):
            im=scene(f//(4*FPS),(f%(4*FPS))/FPS)
            proc.stdin.write(im.tobytes())
            if f%120==60: im.save(ROOT/f'scene-{f//120+1}.jpg',quality=90)
            if f%120==0: print(f'Rendering scene {f//120+1}/6',flush=True)
        proc.stdin.close()
        if proc.wait(): raise RuntimeError('FFmpeg failed; see render.log')
    scene(5,2).save(ROOT/'cover.jpg',quality=95)
    print('Created easyApply-reel.mp4',flush=True)

