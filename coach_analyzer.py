from __future__ import annotations
import cv2, math, base64
import numpy as np


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _angle(a,b,c):
    a=np.array(a,float); b=np.array(b,float); c=np.array(c,float)
    ba=a-b; bc=c-b
    den=np.linalg.norm(ba)*np.linalg.norm(bc)
    if den<1e-8: return None
    x=float(np.dot(ba,bc)/den)
    return math.degrees(math.acos(_clamp(x,-1,1)))


def _line_angle(a,b):
    dx=b[0]-a[0]; dy=b[1]-a[1]
    return math.degrees(math.atan2(-dy,dx))


def _mid(a,b):
    return ((a[0]+b[0])/2,(a[1]+b[1])/2)


def _jpg_data(frame, quality=82):
    h,w=frame.shape[:2]
    if w>900:
        sc=900/w; frame=cv2.resize(frame,(900,int(h*sc)),interpolation=cv2.INTER_AREA)
    ok,j=cv2.imencode('.jpg',frame,[int(cv2.IMWRITE_JPEG_QUALITY),quality])
    if not ok: return None
    return 'data:image/jpeg;base64,'+base64.b64encode(j.tobytes()).decode('ascii')


def _motion_fallback(path, reason='MediaPipe is not installed'):
    cap=cv2.VideoCapture(path)
    fps=float(cap.get(cv2.CAP_PROP_FPS) or 30); n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frames=[]; energies=[]; prev=None
    step=max(1,n//120) if n else 1
    i=0
    while True:
        ok,f=cap.read()
        if not ok: break
        if i%step==0:
            small=cv2.resize(f,(240,135),interpolation=cv2.INTER_AREA)
            g=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY)
            e=0.0 if prev is None else float(cv2.absdiff(g,prev).mean())
            frames.append((i,f.copy())); energies.append(e); prev=g
        i+=1
    cap.release()
    if not frames:
        raise RuntimeError('Coach video could not be decoded')
    impact_idx=int(np.argmax(energies)) if len(energies)>2 else len(frames)//2
    address_idx=max(0,min(len(frames)-1,int(impact_idx*.12)))
    top_idx=max(address_idx+1,min(impact_idx-1,int((address_idx+impact_idx)*.58))) if impact_idx>address_idx+2 else max(0,impact_idx-1)
    phase=[]
    for name,idx in [('ADDRESS',address_idx),('TOP',top_idx),('IMPACT',impact_idx)]:
        fi,fr=frames[idx]; cv2.putText(fr,name,(22,42),cv2.FONT_HERSHEY_SIMPLEX,1.0,(120,255,70),2,cv2.LINE_AA)
        phase.append({'name':name,'frame':int(fi),'image':_jpg_data(fr)})
    return {
        'status':'complete','engine':'motion_only','pose_available':False,
        'score':None,'pose_frames':0,'total_samples':len(frames),'phases':phase,
        'checkpoints':[],
        'tips':['Install the optional BURKESHOT Coach Engine for 33-point body tracking and swing checkpoints.'],
        'note':reason+'. Motion-only mode can identify a rough swing window but does not score body mechanics.'
    }


def analyze_swing(path: str, handedness='right', view='dtl'):
    try:
        import mediapipe as mp
    except Exception as e:
        return _motion_fallback(path,'MediaPipe Coach Engine unavailable')

    cap=cv2.VideoCapture(path)
    if not cap.isOpened(): raise RuntimeError('Coach video could not be opened')
    fps=float(cap.get(cv2.CAP_PROP_FPS) or 30)
    n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step=max(1,n//260) if n else 1
    pose=mp.solutions.pose.Pose(static_image_mode=False,model_complexity=1,enable_segmentation=False,min_detection_confidence=.45,min_tracking_confidence=.45)
    samples=[]; i=0
    while True:
        ok,frame=cap.read()
        if not ok: break
        if i%step:
            i+=1; continue
        rgb=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
        res=pose.process(rgb)
        if res.pose_landmarks:
            lm=res.pose_landmarks.landmark
            pts=[(float(p.x),float(p.y),float(p.visibility)) for p in lm]
            samples.append({'frame':i,'pts':pts,'frame_img':frame.copy()})
        i+=1
    cap.release(); pose.close()
    if len(samples)<8:
        return _motion_fallback(path,'A stable body pose was not detected in enough frames')

    # landmark helpers
    def xy(s,idx): return (s['pts'][idx][0],s['pts'][idx][1])
    def vis(s,idx): return s['pts'][idx][2]
    def wrist_mid(s): return _mid(xy(s,15),xy(s,16))
    def shoulder_mid(s): return _mid(xy(s,11),xy(s,12))
    def hip_mid(s): return _mid(xy(s,23),xy(s,24))
    def shoulder_width(s): return max(1e-5,abs(xy(s,11)[0]-xy(s,12)[0]))

    # Address: quietest wrist movement in first 30% of detected swing.
    wm=[wrist_mid(s) for s in samples]
    speeds=[0.0]
    for a,b in zip(wm,wm[1:]): speeds.append(math.hypot(b[0]-a[0],b[1]-a[1]))
    a_end=max(3,int(len(samples)*.30))
    address_idx=min(range(a_end),key=lambda k:speeds[k]+(.012 if k<2 else 0))

    # Try to use BURKESHOT's ball disappearance for impact. If it doesn't fit,
    # fall back to peak wrist speed after the top.
    impact_frame=None
    try:
        from analyzer import detect_stationary_ball, detect_impact
        b=detect_stationary_ball(path,n)
        im=detect_impact(path,b,n) if b else None
        if im: impact_frame=im.get('contact_frame')
    except Exception:
        pass

    # Top = highest wrist midpoint after address and before the late downswing.
    search_end=max(address_idx+3,int(len(samples)*.82))
    top_idx=min(range(address_idx+1,search_end),key=lambda k:wm[k][1])
    if impact_frame is not None:
        impact_idx=min(range(len(samples)),key=lambda k:abs(samples[k]['frame']-impact_frame))
        if impact_idx<=top_idx: impact_idx=None
    else:
        impact_idx=None
    if impact_idx is None:
        lo=min(len(samples)-1,top_idx+1); hi=max(lo+1,int(len(samples)*.96))
        impact_idx=max(range(lo,min(len(samples),hi)),key=lambda k:speeds[k]) if lo<len(samples) else len(samples)-1

    address=samples[address_idx]; top=samples[top_idx]; impact=samples[impact_idx]
    lead={'right':{'hip':23,'knee':25,'ankle':27},'left':{'hip':24,'knee':26,'ankle':28}}.get(handedness,{'hip':23,'knee':25,'ankle':27})

    # Experimental camera-plane measurements. These are intentionally labelled as
    # checkpoints/proxies rather than pretending they are true 3-D biomechanics.
    sh_a=shoulder_width(address)
    spine_vec_a=(shoulder_mid(address),hip_mid(address))
    spine_vec_i=(shoulder_mid(impact),hip_mid(impact))
    spine_a=abs(90-abs(_line_angle(*spine_vec_a)))
    spine_i=abs(90-abs(_line_angle(*spine_vec_i)))
    lead_knee=_angle(xy(impact,lead['hip']),xy(impact,lead['knee']),xy(impact,lead['ankle']))
    knee_flex=None if lead_knee is None else max(0,180-lead_knee)
    head_shift=abs(xy(impact,0)[0]-xy(address,0)[0])/sh_a*100
    hip_shift=abs(hip_mid(impact)[0]-hip_mid(address)[0])/sh_a*100
    sw_top=shoulder_width(top)
    shoulder_turn_proxy=math.degrees(math.acos(_clamp(sw_top/sh_a,0,1))) if sh_a else None
    shoulder_tilt_top=abs(_line_angle(xy(top,11),xy(top,12)))

    checkpoints=[
        ('Spine tilt at address',spine_a,'°',(5,35),'Keep your address posture athletic rather than excessively upright or tilted.'),
        ('Spine tilt at impact',spine_i,'°',(5,40),'Maintain posture through impact; a large change can indicate early extension.'),
        ('Lead-knee flex at impact',knee_flex,'°',(0,38),'Lead-leg extension should happen progressively through impact.'),
        ('Head movement',head_shift,'% shoulder width',(0,30),'Try to keep head movement controlled while allowing normal rotation.'),
        ('Hip shift',hip_shift,'% shoulder width',(4,55),'Use pressure shift without excessive lateral slide.'),
        ('Shoulder rotation proxy',shoulder_turn_proxy,'°',(18,75),'Create enough turn without losing posture. This is a 2-D proxy, not a true 3-D turn angle.'),
    ]
    cp=[]; tips=[]; scores=[]
    for name,value,unit,band,tip in checkpoints:
        if value is None or not math.isfinite(value):
            cp.append({'name':name,'value':None,'unit':unit,'status':'NO DATA','band':f'{band[0]}–{band[1]}'}); continue
        lo,hi=band
        if lo<=value<=hi: score=100; status='IN RANGE'
        else:
            dist=lo-value if value<lo else value-hi
            span=max(1,hi-lo); score=max(35,100-dist/span*80); status='CHECK'
            tips.append(tip)
        scores.append(score)
        cp.append({'name':name,'value':round(float(value),1),'unit':unit,'status':status,'band':f'{lo}–{hi}'})
    score=round(float(np.mean(scores))) if scores else None
    if not tips: tips=['No major camera-plane checkpoint was outside the current BURKESHOT baseline. Review the phase images alongside ball-flight data.']
    tips=tips[:3]

    POSE_CONNECTIONS=list(mp.solutions.pose.POSE_CONNECTIONS)
    def overlay(sample,label):
        fr=sample['frame_img'].copy(); h,w=fr.shape[:2]
        pts=sample['pts']
        for a,b in POSE_CONNECTIONS:
            if pts[a][2]<.35 or pts[b][2]<.35: continue
            pa=(int(pts[a][0]*w),int(pts[a][1]*h)); pb=(int(pts[b][0]*w),int(pts[b][1]*h))
            cv2.line(fr,pa,pb,(90,230,255),2,cv2.LINE_AA)
        for idx in [0,11,12,13,14,15,16,23,24,25,26,27,28]:
            if pts[idx][2]<.35: continue
            p=(int(pts[idx][0]*w),int(pts[idx][1]*h)); cv2.circle(fr,p,4,(170,255,55),-1,cv2.LINE_AA)
        cv2.rectangle(fr,(12,12),(190,54),(5,8,8),-1); cv2.putText(fr,label,(22,43),cv2.FONT_HERSHEY_SIMPLEX,.8,(180,255,55),2,cv2.LINE_AA)
        return _jpg_data(fr)

    phases=[]
    for label,samp in [('ADDRESS',address),('TOP',top),('IMPACT',impact)]:
        phases.append({'name':label,'frame':int(samp['frame']),'image':overlay(samp,label)})
    return {
        'status':'complete','engine':'mediapipe_pose','pose_available':True,
        'score':score,'pose_frames':len(samples),'total_samples':len(samples),
        'phases':phases,'checkpoints':cp,'tips':tips,
        'note':'Experimental BURKESHOT Coach: 33-point pose tracking with camera-plane checkpoints. Values are not a substitute for calibrated 3-D biomechanics.',
        'view':view,'handedness':handedness,'fps':fps
    }
