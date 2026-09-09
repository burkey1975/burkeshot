from __future__ import annotations
import cv2
import numpy as np
import math
import os
import base64
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional

BALL_DIAMETER_M = 0.04267
MPS_TO_MPH = 2.2369362921


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _notify(progress, stage: str, percent: int):
    if progress:
        progress(stage, percent)


def _frame_times(path: str, capture_mode: str, capture_fps: float):
    """Return measurement-time seconds for decoded frames.

    Original real-time files use container presentation timestamps. Confirmed
    slow-motion files use their selected source-capture rate because their PTS
    describe slowed playback rather than the original interval at impact.
    """
    try:
        import av

        times = []
        with av.open(path) as container:
            stream = container.streams.video[0]
            for index, frame in enumerate(container.decode(stream)):
                if capture_mode in {'original', 'real_auto'} and frame.pts is not None:
                    value = float(frame.pts * frame.time_base)
                else:
                    value = index / max(1.0, float(capture_fps))
                times.append(round(value, 9))
        if times:
            origin = times[0]
            return [round(value-origin, 9) for value in times], 'container_pts' if capture_mode in {'original', 'real_auto'} else 'confirmed_capture_rate'
    except Exception:
        pass
    return [], 'frame_rate_fallback'


def _point_time(frame: int, frame_times, capture_fps: float):
    if frame_times and 0 <= int(frame) < len(frame_times):
        return float(frame_times[int(frame)])
    return float(frame) / max(1.0, float(capture_fps))


def _frame_at(cap, idx: int):
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
    ok, frame = cap.read()
    return frame if ok else None


def _white_candidates(frame: np.ndarray):
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 145]), np.array([180, 115, 255]))
    mask[: int(h * 0.58), :] = 0
    mask = cv2.medianBlur(mask, 3)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in contours:
        area = cv2.contourArea(c)
        if not (45 <= area <= 1200):
            continue
        x, y, ww, hh = cv2.boundingRect(c)
        if not (7 <= ww <= 50 and 7 <= hh <= 50):
            continue
        aspect = max(ww / max(1, hh), hh / max(1, ww))
        if aspect > 1.65:
            continue
        peri = cv2.arcLength(c, True)
        circ = 4 * math.pi * area / (peri * peri) if peri else 0
        if circ < 0.55:
            continue
        M = cv2.moments(c)
        if not M['m00']:
            continue
        cx = M['m10'] / M['m00']
        cy = M['m01'] / M['m00']
        out.append(dict(cx=float(cx), cy=float(cy), area=float(area), circ=float(circ), ww=int(ww), hh=int(hh)))
    return out


def _ball_from_hint(path: str, frame_count: int, ball_hint):
    """Anchor detection to the golfer-selected hitting point.

    The hint is trusted as the centre. Nearby contours are used only to refine
    size and centre; failure to find a white contour no longer discards a valid
    user selection.
    """
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return None
    sample_count = min(12, max(1, frame_count // 20))
    centres, diameters = [], []
    width = height = 0
    for index in range(sample_count):
        frame = _frame_at(cap, index)
        if frame is None:
            continue
        height, width = frame.shape[:2]
        hx, hy = float(ball_hint[0]) * width, float(ball_hint[1]) * height
        radius = max(30, int(min(width, height) * .055))
        roi = frame[max(0, int(hy-radius)):min(height, int(hy+radius)), max(0, int(hx-radius)):min(width, int(hx+radius))]
        if not roi.size:
            continue
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        value_floor = max(115, int(np.percentile(hsv[:, :, 2], 72)))
        mask = ((hsv[:, :, 2] >= value_floor) & (hsv[:, :, 1] <= 155)).astype(np.uint8) * 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        for contour in contours:
            area = cv2.contourArea(contour)
            if not 12 <= area <= radius * radius * .9:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            cx = max(0, int(hx-radius)) + x + w/2
            cy = max(0, int(hy-radius)) + y + h/2
            distance = math.hypot(cx-hx, cy-hy)
            aspect = max(w/max(1, h), h/max(1, w))
            if distance > radius*.55 or aspect > 1.9:
                continue
            score = area * math.exp(-distance/max(8, radius*.2)) / aspect
            if best is None or score > best[0]:
                best = score, cx, cy, (w+h)/2
        if best:
            _, cx, cy, diameter = best
            centres.append((cx, cy)); diameters.append(diameter)
    cap.release()
    if not width or not height:
        return None
    hx, hy = float(ball_hint[0]) * width, float(ball_hint[1]) * height
    if centres:
        x = float(np.median([p[0] for p in centres])); y = float(np.median([p[1] for p in centres]))
        diameter = float(np.median(diameters))
        confidence = _clamp(.72 + len(centres)*.02, .72, .94)
        source = 'guided_refined'
    else:
        x, y = hx, hy
        diameter = max(8.0, min(width, height)*.012)
        confidence = .64
        source = 'guided_position'
    return {
        'x': x, 'y': y, 'diameter_px': diameter, 'confidence': confidence,
        'persistence': len(centres)/max(1, sample_count), 'sample_frames': list(range(sample_count)),
        'candidate_score': None, 'hint_match': 1.0, 'normalized_x': x/width,
        'normalized_y': y/height, 'hitting_zone_quality': 1.0, 'source': source,
    }


def detect_stationary_ball(path: str, frame_count: int, ball_hint=None):
    if ball_hint is not None:
        guided = _ball_from_hint(path, frame_count, ball_hint)
        if guided:
            return guided
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError('Could not open video')
    # Address/swing clips usually contain the stationary ball during the first ~20%.
    scan_end = min(max(36, int(frame_count * 0.24)), 90, max(1, frame_count - 5))
    step = max(2, scan_end // 16)
    sample_idxs = list(range(0, scan_end, step))
    candidates = []
    h = w = None
    for idx in sample_idxs:
        frame = _frame_at(cap, idx)
        if frame is None:
            continue
        h, w = frame.shape[:2]
        for c in _white_candidates(frame):
            c['frame'] = idx
            candidates.append(c)
    cap.release()
    if not candidates or h is None:
        return None

    clusters: List[List[dict]] = []
    for c in candidates:
        best = None
        best_dist = 1e9
        for cl in clusters:
            mx = float(np.median([p['cx'] for p in cl]))
            my = float(np.median([p['cy'] for p in cl]))
            d = math.hypot(c['cx'] - mx, c['cy'] - my)
            if d < 18 and d < best_dist:
                best, best_dist = cl, d
        if best is None:
            clusters.append([c])
        else:
            best.append(c)

    ranked = []
    for cl in clusters:
        frames = len(set(p['frame'] for p in cl))
        persistence = frames / max(1, len(sample_idxs))
        mx = float(np.median([p['cx'] for p in cl]))
        my = float(np.median([p['cy'] for p in cl]))
        diameter = float(np.median([(p['ww'] + p['hh']) / 2 for p in cl]))
        circ = float(np.mean([p['circ'] for p in cl]))
        yfrac = my / h
        # Golf balls in a normal phone framing are usually on the lower ground/mat region.
        yscore = _clamp((yfrac - 0.64) / 0.23, 0, 1)
        xfrac = mx / w
        sizescore = math.exp(-abs(diameter - 16) / 12)

        # BURKESHOT Shot Mode uses a fixed hitting window like a phone launch-monitor
        # setup.  In the user's current right-handed camera placement the ball lives
        # in the lower-right quarter.  This prior prevents white shoes, tees and
        # reflections elsewhere in the frame from beating a persistent golf ball.
        default_zone_score = math.exp(
            -(((xfrac - 0.78) / 0.20) ** 2 + ((yfrac - 0.79) / 0.18) ** 2)
        )
        score = (
            2.70 * persistence
            + 0.78 * circ
            + 0.90 * yscore
            + 0.55 * sizescore
            + 1.05 * default_zone_score
        )
        # Golfboy-style session setup: once a ball position has been learned,
        # strongly prefer the same hitting zone on subsequent shots. The hint is
        # normalised (0..1) so it survives resolution/orientation changes.
        hint_score = 0.0
        if ball_hint is not None and w and h:
            try:
                hx=float(ball_hint[0])*w; hy=float(ball_hint[1])*h
                hd=math.hypot(mx-hx,my-hy)
                hint_score=math.exp(-hd/max(28.0, min(w,h)*0.075))
                score += 1.55 * hint_score
            except Exception:
                hint_score=0.0
        if yfrac < 0.64:
            score -= 0.8
        ranked.append((score, persistence, mx, my, diameter, circ, frames, hint_score))
    ranked.sort(reverse=True, key=lambda x: x[0])
    if not ranked:
        return None
    score, persistence, x, y, d, circ, frames, hint_score = ranked[0]
    confidence = _clamp(0.30 + persistence * 0.45 + circ * 0.18 + min(d / 28, 1) * 0.12 + hint_score*0.08, 0, 0.99)
    return {
        'x': x, 'y': y, 'diameter_px': d, 'confidence': confidence,
        'persistence': persistence, 'sample_frames': sample_idxs,
        'candidate_score': score, 'hint_match': hint_score,
        'normalized_x': float(x / w) if w else None,
        'normalized_y': float(y / h) if h else None,
        'hitting_zone_quality': float(math.exp(
            -((((x / w) if w else 0.78) - 0.78) / 0.20) ** 2
            - ((((y / h) if h else 0.79) - 0.79) / 0.18) ** 2
        )) if w and h else 0.0,
        'source': 'automatic',
    }


def _ball_white_fraction(frame, x, y, diameter):
    h, w = frame.shape[:2]
    r = max(5, int(round(diameter * 0.52)))
    x0, x1 = max(0, int(x-r)), min(w, int(x+r+1))
    y0, y1 = max(0, int(y-r)), min(h, int(y+r+1))
    patch = frame[y0:y1, x0:x1]
    if patch.size == 0:
        return 0.0, 0.0
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    white = ((hsv[:, :, 1] < 105) & (hsv[:, :, 2] > 145)).mean()
    lum = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY).mean()
    return float(white), float(lum)


def detect_impact(path: str, ball: dict, frame_count: int):
    cap = cv2.VideoCapture(path)
    x, y, d = ball['x'], ball['y'], ball['diameter_px']
    vals = []
    # We only need to scan until the ball disappears; whole video is still cheap at phone resolution.
    for i in range(frame_count):
        ok, frame = cap.read()
        if not ok:
            break
        wf, lum = _ball_white_fraction(frame, x, y, d)
        vals.append((i, wf, lum))
    cap.release()
    if len(vals) < 8:
        return None
    baseline_slice = vals[: max(8, min(len(vals)//4, 45))]
    base_white = float(np.median([v[1] for v in baseline_slice]))
    base_lum = float(np.median([v[2] for v in baseline_slice]))
    # Find first sustained disappearance after enough address frames.
    start = max(6, int(len(vals) * 0.06))
    first_gone = None
    for i in range(start, len(vals)-2):
        wf0, wf1, wf2 = vals[i][1], vals[i+1][1], vals[i+2][1]
        lum0 = vals[i][2]
        white_drop = wf0 < max(0.08, base_white * 0.28)
        lum_drop = lum0 < base_lum - max(18, base_lum * 0.12)
        sustained = wf1 < max(0.10, base_white * 0.36) and wf2 < max(0.12, base_white * 0.42)
        if sustained and (white_drop or lum_drop):
            first_gone = i
            break
    if first_gone is None:
        return None
    contact = max(0, first_gone - 1)
    # Confidence from how decisive the drop is.
    pre = vals[contact][1] if contact < len(vals) else base_white
    post = vals[first_gone][1]
    drop = _clamp((pre - post) / max(0.15, base_white), 0, 1)
    confidence = _clamp(0.55 + 0.4 * drop, 0, 0.99)
    return {
        'contact_frame': int(contact), 'first_gone_frame': int(first_gone),
        'confidence': confidence, 'baseline_white': base_white,
        'series_excerpt': [{'frame': int(i), 'white': round(float(w), 3)} for i, w, _ in vals[max(0,contact-3):min(len(vals),first_gone+4)]]
    }


def _moving_bright_candidates(prev, cur, roi, ball_d):
    """Return bright moving blobs, preserving streak geometry.

    Immediately after impact a phone camera usually records the golf ball as an
    elongated white streak, not a small round dot.  The older tracker strongly
    preferred tiny dot-like blobs and could lock onto turf/club reflections.
    """
    h, w = cur.shape[:2]
    x0, y0, x1, y1 = [int(v) for v in roi]
    x0=max(0,x0); y0=max(0,y0); x1=min(w,x1); y1=min(h,y1)
    if x1<=x0 or y1<=y0:
        return []
    a=prev[y0:y1,x0:x1]
    b=cur[y0:y1,x0:x1]
    diff=cv2.cvtColor(cv2.absdiff(a,b),cv2.COLOR_BGR2GRAY)
    hsv=cv2.cvtColor(b,cv2.COLOR_BGR2HSV)
    motion=(diff>16).astype(np.uint8)*255
    bright=((hsv[:,:,2]>132)&(hsv[:,:,1]<150)).astype(np.uint8)*255
    mask=cv2.bitwise_and(motion,bright)
    mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((2,2),np.uint8))
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    out=[]
    for c in contours:
        area=float(cv2.contourArea(c))
        if area<4 or area>max(2200, ball_d*ball_d*11):
            continue
        x,y,ww,hh=cv2.boundingRect(c)
        if ww>ball_d*8 or hh>ball_d*8:
            continue
        M=cv2.moments(c)
        if not M['m00']:
            continue
        cx=x0+M['m10']/M['m00']
        cy=y0+M['m01']/M['m00']
        major=max(ww,hh)
        minor=max(1,min(ww,hh))
        aspect=major/minor
        out.append({
            'x':float(cx),'y':float(cy),'area':area,
            'w':int(ww),'h':int(hh),'major':float(major),'minor':float(minor),
            'aspect':float(aspect)
        })
    return out


def _track_ball_primary(path: str, ball: dict, impact: dict, capture_fps: float, frame_count: int, frame_times=None):
    """Track the real post-impact ball/streak rather than tiny bright fragments."""
    cap=cv2.VideoCapture(path)
    contact=impact['contact_frame']
    x0,y0,d=ball['x'],ball['y'],max(8.0,ball['diameter_px'])
    ppm=d/BALL_DIAMETER_M
    points=[{'frame':contact,'time_s':_point_time(contact,frame_times,capture_fps),'x':x0,'y':y0,'kind':'address'}]
    prev_point=np.array([x0,y0],dtype=float)
    velocity=None
    prev_frame=_frame_at(cap,contact)
    misses=0
    scores=[]

    # A real 240-fps iron/driver ball can move several ball diameters per frame.
    max_first=max(85.0,d*12.0)
    for fi in range(contact+1,min(frame_count,contact+13)):
        cur=_frame_at(cap,fi)
        if cur is None or prev_frame is None:
            break
        if velocity is None:
            pred=prev_point
            radius=max_first
        else:
            pred=prev_point+velocity
            radius=max(58.0,float(np.linalg.norm(velocity))*1.35+d*4.0)
        roi=[pred[0]-radius,pred[1]-radius,pred[0]+radius,pred[1]+radius]
        cands=_moving_bright_candidates(prev_frame,cur,roi,d)
        best=None
        best_score=-1.0
        for c in cands:
            p=np.array([c['x'],c['y']],dtype=float)
            disp=p-prev_point
            dist=float(np.linalg.norm(disp))

            if velocity is None:
                # Reject the near-stationary club/ball residue and tiny turf flecks.
                if dist<d*1.20 or dist>max_first*1.15:
                    continue
                proximity=math.exp(-abs(dist-d*3.0)/(d*3.2))
                major_score=math.exp(-abs(c['major']-d*2.0)/(d*1.9))
                area_score=min(1.0,c['area']/max(1.0,d*d*0.55))
                streak_score=min(1.0,max(0.0,(c['aspect']-1.0)/2.3))
                score=0.27*proximity+0.28*major_score+0.27*area_score+0.18*streak_score
            else:
                err=float(np.linalg.norm(p-pred))
                proximity=math.exp(-err/max(d*3.0,float(np.linalg.norm(velocity))*1.0))
                denom=max(1e-6,float(np.linalg.norm(disp))*float(np.linalg.norm(velocity)))
                cosang=float(np.dot(disp,velocity)/denom)
                direction_score=_clamp((cosang+1.0)/2.0,0,1)
                major_score=math.exp(-abs(c['major']-d*2.0)/(d*2.2))
                area_score=min(1.0,c['area']/max(1.0,d*d*0.45))
                streak_score=min(1.0,max(0.0,(c['aspect']-1.0)/2.5))
                score=0.43*proximity+0.27*direction_score+0.11*major_score+0.10*area_score+0.09*streak_score
            if score>best_score:
                best_score=score
                best=c

        if best is None or best_score<0.38:
            misses+=1
            prev_frame=cur
            if misses>=2:
                break
            continue

        p=np.array([best['x'],best['y']],dtype=float)
        disp=p-prev_point
        if velocity is None:
            velocity=disp
        else:
            # Keep direction smooth while allowing the streak centroid to shorten.
            if np.linalg.norm(velocity)>1e-6 and np.linalg.norm(disp)>1e-6:
                cos=float(np.dot(disp,velocity)/(np.linalg.norm(disp)*np.linalg.norm(velocity)))
                if cos<0.25:
                    break
            velocity=0.70*velocity+0.30*disp
        prev_point=p
        points.append({
            'frame':fi,'time_s':_point_time(fi,frame_times,capture_fps),'x':float(p[0]),'y':float(p[1]),'kind':'measured',
            'blob_w':best['w'],'blob_h':best['h'],'blob_area':best['area'],
            'blob_aspect':best['aspect']
        })
        scores.append(float(best_score))
        misses=0
        prev_frame=cur
    cap.release()

    measured=[p for p in points if p['kind']=='measured']
    consistency=float(np.mean(scores)) if scores else 0.0
    confidence=_clamp(0.18+0.075*len(measured)+0.42*consistency,0,0.96)

    # Estimate the image-plane trajectory.  This is safe for trace drawing, but
    # speed/launch are exposed only when the camera geometry is sufficiently side-on.
    launch=None
    sideon_ratio=None
    if len(points)>=3:
        fitpts=points[:min(len(points),8)]
        xs=np.array([p['x'] for p in fitpts],dtype=float)
        ys=np.array([p['y'] for p in fitpts],dtype=float)
        dx=float(xs[-1]-xs[0]); dy=float(ys[-1]-ys[0])
        if abs(dx)>d*0.8:
            raw=math.degrees(math.atan2(-dy,abs(dx)))
            if -5<=raw<=55:
                launch=raw
        sideon_ratio=abs(dx)/(abs(dy)+1e-6)

    # 2-D pixel-speed calculation.  It is withheld later if geometry is not side-on.
    step_speeds=[]
    for a,b in zip(points,points[1:]):
        dt=float(b.get('time_s',_point_time(b['frame'],frame_times,capture_fps)))-float(a.get('time_s',_point_time(a['frame'],frame_times,capture_fps)))
        if dt<=0: continue
        pix=math.hypot(b['x']-a['x'],b['y']-a['y'])
        mps=(pix/ppm)/dt
        if 8<=mps<=100:
            step_speeds.append(mps)
    speed_mph=None
    if len(step_speeds)>=3:
        # Streak centroids are noisy.  Use the first 5 and require moderate consistency.
        arr=np.array(step_speeds[:5],dtype=float)
        med=float(np.median(arr))
        keep=arr[np.abs(arr-med)<=max(7.0,med*0.32)]
        if len(keep)>=3:
            speed_mph=float(np.median(keep)*MPS_TO_MPH)

    return {
        'points':points,
        'confidence':confidence,
        'ball_speed_mph':speed_mph,
        'launch_angle_deg':launch,
        'pixels_per_meter':ppm,
        'sideon_ratio':sideon_ratio,
        'step_speeds_mps':[float(x) for x in step_speeds[:6]],
    }


def _bg_streak_candidates(base, cur, roi, ball_d):
    """Candidates from a fixed pre-impact background.

    This recovery detector is intentionally different from the primary
    frame-to-frame detector.  If a fast ball is missed for one frame, comparing
    every later frame with the pre-impact image still exposes the complete white
    streak, so the tracker can reacquire it instead of giving up after 1-2 points.
    """
    h,w=cur.shape[:2]
    x0,y0,x1,y1=[int(v) for v in roi]
    x0=max(0,x0); y0=max(0,y0); x1=min(w,x1); y1=min(h,y1)
    if x1<=x0 or y1<=y0: return []
    a=base[y0:y1,x0:x1]; b=cur[y0:y1,x0:x1]
    diff=cv2.cvtColor(cv2.absdiff(a,b),cv2.COLOR_BGR2GRAY)
    hsv=cv2.cvtColor(b,cv2.COLOR_BGR2HSV)
    gray=cv2.cvtColor(b,cv2.COLOR_BGR2GRAY)
    motion=(diff>12).astype(np.uint8)*255
    bright=((hsv[:,:,2]>118)&(hsv[:,:,1]<175)&(gray>105)).astype(np.uint8)*255
    mask=cv2.bitwise_and(motion,bright)
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    out=[]
    for c in contours:
        area=float(cv2.contourArea(c))
        if area<3 or area>max(3600.0,ball_d*ball_d*22): continue
        x,y,ww,hh=cv2.boundingRect(c)
        major=max(ww,hh); minor=max(1,min(ww,hh)); aspect=major/minor
        if major>max(150,ball_d*13.5) or minor>max(65,ball_d*5.0): continue
        M=cv2.moments(c)
        if not M['m00']: continue
        cx=x0+M['m10']/M['m00']; cy=y0+M['m01']/M['m00']
        cmask=np.zeros((y1-y0,x1-x0),np.uint8)
        shifted=c.copy(); shifted[:,:,0]-=x0; shifted[:,:,1]-=y0
        cv2.drawContours(cmask,[shifted],-1,255,-1)
        mean_v=float(cv2.mean(hsv[:,:,2],mask=cmask)[0]) if cmask.any() else 0.0
        mean_motion=float(cv2.mean(diff,mask=cmask)[0]) if cmask.any() else 0.0
        streak=min(1.0,max(0.0,(aspect-1.0)/4.5))
        area_q=min(1.0,area/max(8.0,ball_d*ball_d*.6))
        brightness=_clamp((mean_v-115.0)/120.0,0,1)
        motion_q=_clamp((mean_motion-10.0)/80.0,0,1)
        quality=.28*streak+.24*area_q+.28*brightness+.20*motion_q
        out.append({'x':float(cx),'y':float(cy),'w':int(ww),'h':int(hh),'major':float(major),'minor':float(minor),'aspect':float(aspect),'area':area,'quality':float(quality)})
    return out


def _recover_ball_track(path: str, ball: dict, impact: dict, capture_fps: float, frame_count: int, seed_points=None, frame_times=None):
    """Beam-search reacquisition for clips where the primary tracker loses the ball."""
    cap=cv2.VideoCapture(path)
    contact=int(impact['contact_frame'])
    base=_frame_at(cap,max(0,contact-2))
    if base is None:
        cap.release(); return {'points':[],'confidence':0.0,'recovery_used':True}
    h,w=base.shape[:2]
    x0,y0,d=float(ball['x']),float(ball['y']),max(8.0,float(ball['diameter_px']))
    ppm=d/BALL_DIAMETER_M
    start={'frame':contact,'time_s':_point_time(contact,frame_times,capture_fps),'x':x0,'y':y0,'kind':'address'}
    # If the primary detector managed the first post-impact point, use it as a
    # launch-vector seed.  This is the common v3.1 failure shown by the user:
    # BALL/IMPACT are strong, TRACE POINTS = 2, then tracking stops.
    seed=[]
    if seed_points:
        for p0 in seed_points:
            if p0.get('frame',contact) >= contact:
                seed.append(dict(p0))
    if not seed:
        seed=[start]
    elif seed[0].get('frame') != contact:
        seed.insert(0,start)
    last=seed[-1]
    if len(seed)>=2:
        a,b=seed[-2],seed[-1]
        df=max(1,b['frame']-a['frame'])
        vx=(b['x']-a['x'])/df; vy=(b['y']-a['y'])/df
    else:
        vx=vy=None
    # state = score, path, vx, vy, last_frame.  Score is deliberately dominated
    # by path length so a coherent multi-frame ball track beats one shiny blob.
    states=[(max(0.0,(len(seed)-1)*1.2),seed,vx,vy,int(last['frame']))]
    end=min(frame_count,contact+18)
    for fi in range(int(last['frame'])+1,end):
        cur=_frame_at(cap,fi)
        if cur is None: break
        gap=fi-contact
        radius=min(max(w,h)*1.05,max(120.0,d*14.0)+gap*max(38.0,d*5.0))
        roi=[x0-radius,y0-radius,x0+radius,y0+radius]
        cands=_bg_streak_candidates(base,cur,roi,d)
        # Keep only the most ball-like blobs to control combinatorics.
        cands=sorted(cands,key=lambda c:c['quality'],reverse=True)[:28]
        new_states=[]
        # allow a missed frame so the ball can disappear into motion blur and return
        for score,path,vx,vy,lastf in states:
            if fi-lastf<=2:
                new_states.append((score-.18,path,vx,vy,lastf))
            last=np.array([path[-1]['x'],path[-1]['y']],dtype=float)
            vel=None if vx is None else np.array([vx,vy],dtype=float)
            for c in cands:
                p=np.array([c['x'],c['y']],dtype=float)
                df=fi-lastf
                if df<=0: continue
                disp=p-last; step=float(np.linalg.norm(disp))/df
                total=float(np.linalg.norm(p-np.array([x0,y0])))
                if total<d*.75: continue
                # broad enough for 30-fps real-time exports while still rejecting
                # impossible jumps across the whole frame.
                max_step=max(185.0,d*18.0)
                if step<d*.35 or step>max_step: continue
                if vel is None:
                    # First reacquired ball image: reward a streak and a clean move
                    # away from the address point; penalise giant club-shaped blobs.
                    dist_q=math.exp(-abs(step-d*3.0)/max(d*5.0,30.0))
                    shape_q=min(1.0,c['quality']+.14*min(1.0,(c['aspect']-1)/3.0))
                    edge_score=.52*shape_q+.28*dist_q+.20*min(1.0,total/max(1,d*5))
                    nv=disp/df
                else:
                    pred=last+vel*df
                    err=float(np.linalg.norm(p-pred))
                    pred_scale=max(28.0,float(np.linalg.norm(vel))*df*1.1+d*2.5)
                    # Once we have even one real launch vector, do not let a shiny
                    # club/turf blob on the other side of the frame steal the path.
                    if err>pred_scale*1.75:
                        continue
                    prox=math.exp(-err/pred_scale)
                    denom=max(1e-6,float(np.linalg.norm(disp))*float(np.linalg.norm(vel)))
                    cos=float(np.dot(disp,vel)/denom)
                    if cos<-0.10: continue
                    direction=_clamp((cos+1)/2,0,1)
                    accel=abs(step-float(np.linalg.norm(vel)))/max(8.0,float(np.linalg.norm(vel)))
                    smooth=math.exp(-accel*1.7)
                    edge_score=.38*prox+.25*direction+.18*smooth+.19*c['quality']
                    nv=.68*vel+.32*(disp/df)
                npath=path+[{'frame':fi,'time_s':_point_time(fi,frame_times,capture_fps),'x':float(p[0]),'y':float(p[1]),'kind':'recovered','blob_w':c['w'],'blob_h':c['h'],'blob_area':c['area'],'blob_aspect':c['aspect']}]
                nscore=score+1.0+edge_score
                new_states.append((nscore,npath,float(nv[0]),float(nv[1]),fi))
        # Prefer longer paths first, then quality score.
        new_states.sort(key=lambda st:(len(st[1]),st[0]),reverse=True)
        states=new_states[:18] if new_states else states
    cap.release()
    if not states:
        return {'points':[start],'confidence':0.05,'ball_speed_mph':None,'launch_angle_deg':None,'pixels_per_meter':ppm,'recovery_used':True}
    best=max(states,key=lambda st:(len(st[1]),st[0]))
    points=best[1]
    measured=points[1:]
    if len(measured)<2:
        return {'points':points,'confidence':0.12,'ball_speed_mph':None,'launch_angle_deg':None,'pixels_per_meter':ppm,'recovery_used':True}
    # Geometry and cautious speed estimate from recovered centres.
    dx=points[min(len(points)-1,6)]['x']-points[0]['x']; dy=points[min(len(points)-1,6)]['y']-points[0]['y']
    launch=None
    if abs(dx)>d*.8:
        raw=math.degrees(math.atan2(-dy,abs(dx)))
        if -5<=raw<=55: launch=float(raw)
    speeds=[]
    for a,b in zip(points,points[1:]):
        dt=float(b.get('time_s',_point_time(b['frame'],frame_times,capture_fps)))-float(a.get('time_s',_point_time(a['frame'],frame_times,capture_fps)))
        if dt<=0: continue
        pix=math.hypot(b['x']-a['x'],b['y']-a['y'])
        mps=(pix/ppm)/dt
        if 8<=mps<=100: speeds.append(mps)
    speed=None
    if len(speeds)>=3:
        arr=np.array(speeds[:7],dtype=float); med=float(np.median(arr))
        keep=arr[np.abs(arr-med)<=max(8.0,med*.38)]
        if len(keep)>=3: speed=float(np.median(keep)*MPS_TO_MPH)
    conf=_clamp(.20+.055*len(measured)+.035*max(0,best[0]-len(measured)),0,.82)
    return {'points':points,'confidence':conf,'ball_speed_mph':speed,'launch_angle_deg':launch,'pixels_per_meter':ppm,'sideon_ratio':abs(dx)/(abs(dy)+1e-6),'step_speeds_mps':[float(x) for x in speeds[:8]],'recovery_used':True}


def track_ball(path: str, ball: dict, impact: dict, capture_fps: float, frame_count: int, frame_times=None):
    primary=_track_ball_primary(path,ball,impact,capture_fps,frame_count,frame_times)
    primary_n=len(primary.get('points',[]))
    # The issue seen in BURKESHOT v3.1 was exactly this case: excellent ball/impact
    # lock but only 1-2 post-impact points.  Re-run with fixed-background streak
    # recovery and use it only when it materially improves the track.
    if primary_n<5 or primary.get('confidence',0)<.44:
        recovery=_recover_ball_track(path,ball,impact,capture_fps,frame_count,seed_points=primary.get('points',[]),frame_times=frame_times)
        rec_n=len(recovery.get('points',[]))
        if rec_n>=max(4,primary_n+2):
            recovery['primary_points']=primary_n
            return recovery
    primary['recovery_used']=False
    return primary

def track_club(path: str, ball: dict, impact: dict, capture_fps: float, frame_count: int, frame_times=None):
    cap=cv2.VideoCapture(path)
    contact=impact['contact_frame']; x,y,d=ball['x'],ball['y'],max(8,ball['diameter_px']); ppm=d/BALL_DIAMETER_M
    candidates=[]
    # Use moving contours and retain the contour edge nearest the ball in the last frames before contact.
    prev=_frame_at(cap,max(0,contact-9))
    for fi in range(max(1,contact-8),contact+1):
        cur=_frame_at(cap,fi)
        if prev is None or cur is None: prev=cur; continue
        diff=cv2.cvtColor(cv2.absdiff(prev,cur),cv2.COLOR_BGR2GRAY)
        mask=(diff>27).astype(np.uint8)*255
        roi_mask=np.zeros_like(mask)
        cv2.circle(roi_mask,(int(x),int(y)),int(max(230,d*15)),255,-1)
        mask=cv2.bitwise_and(mask,roi_mask)
        mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
        contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        best=None
        for c in contours:
            area=cv2.contourArea(c)
            if not (12<=area<=4500): continue
            pts=c.reshape(-1,2).astype(float)
            dists=np.linalg.norm(pts-np.array([x,y]),axis=1)
            k=int(np.argmin(dists)); nearest=pts[k]; md=float(dists[k])
            if md>max(220,d*12): continue
            # Prefer compact/moving pieces close to the impact zone.
            bx,by,bw,bh=cv2.boundingRect(c)
            if bw>260 or bh>330: continue
            score=math.exp(-md/max(45,d*5)) + min(area/700,1)*0.18
            if best is None or score>best[0]: best=(score,nearest,md,area)
        if best:
            _,p,md,area=best
            candidates.append({'frame':fi,'time_s':_point_time(fi,frame_times,capture_fps),'x':float(p[0]),'y':float(p[1]),'distance_to_ball':md})
        prev=cur
    cap.release()
    if len(candidates)<3:
        return {'points':candidates,'confidence':0.08,'club_speed_mph':None,'attack_angle_deg':None}

    # Keep a trailing monotonic approach sequence ending nearest contact.
    seq=[]
    last_d=1e9
    for p in reversed(candidates):
        if not seq or p['distance_to_ball'] >= last_d-8:
            seq.append(p); last_d=p['distance_to_ball']
        if len(seq)>=5: break
    seq=list(reversed(seq))
    if len(seq)<3:
        seq=candidates[-3:]
    steps=[]
    for a,b in zip(seq,seq[1:]):
        dt=float(b.get('time_s',_point_time(b['frame'],frame_times,capture_fps)))-float(a.get('time_s',_point_time(a['frame'],frame_times,capture_fps))); pix=math.hypot(b['x']-a['x'],b['y']-a['y'])
        if dt>0:
            mps=(pix/ppm)/dt
            if 8<=mps<=70: steps.append(mps)
    speed=None
    smooth=False
    if len(steps)>=3:
        arr=np.array(steps,dtype=float)
        cv=float(np.std(arr)/max(1e-6,np.mean(arr)))
        smooth=cv<=0.22
        if smooth:
            speed=float(np.median(arr)*MPS_TO_MPH)
    a,b=seq[0],seq[-1]; dx=b['x']-a['x']; dy=b['y']-a['y']
    attack=math.degrees(math.atan2(-dy,abs(dx))) if abs(dx)>d*0.8 and smooth else None
    if attack is not None and not (-15<=attack<=15): attack=None
    conf=_clamp(0.12+0.08*len(seq)+(0.28 if speed else 0)+(0.12 if attack is not None else 0),0,0.72)
    if not smooth: conf=min(conf,0.42)
    return {'points':seq,'confidence':conf,'club_speed_mph':speed,'attack_angle_deg':attack}


def analyze_video(path: str, capture_fps: float = 240.0, capture_mode: str = '240_slo', ball_hint=None, progress=None):
    _notify(progress,'Reading video metadata',5)
    cap=cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError('Video could not be opened')
    encoded_fps=float(cap.get(cv2.CAP_PROP_FPS) or 0)
    frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration=frame_count/encoded_fps if encoded_fps>0 else None
    cap.release()

    requested_capture_fps=float(capture_fps)
    effective_capture_fps=requested_capture_fps
    timing_warning=None
    if capture_mode=='real_auto':
        effective_capture_fps=encoded_fps if encoded_fps>0 else requested_capture_fps
        if effective_capture_fps<90:
            timing_warning='This real-time file is below 90 fps. Use an original high-frame-rate file for calibrated estimates.'
    elif capture_mode=='120_slo':
        effective_capture_fps=120.0
    elif capture_mode=='120_real':
        # Real-time footage must actually contain the high-rate frames.  If an
        # export has already been reduced to 30/60 fps, those missing frames cannot
        # be recreated by simply multiplying the physics by 120.
        if encoded_fps>0 and encoded_fps<90:
            effective_capture_fps=encoded_fps
            timing_warning=(
                f'This real-time export contains only {encoded_fps:.1f} frames/s. '
                'The original 120-fps frames were dropped during export, so BURKESHOT uses the frames that really exist.'
            )
        else:
            effective_capture_fps=encoded_fps if encoded_fps>=90 else 120.0
    elif capture_mode=='240_slo':
        # iPhone slow motion intentionally plays the captured frames back at a lower
        # encoded frame rate.  Physics still uses the original 240-fps capture timing.
        effective_capture_fps=240.0

    _notify(progress,'Reading exact frame timestamps',12)
    frame_times,timing_source=_frame_times(path,capture_mode,effective_capture_fps)

    result={
        'video': {
            'width':width,'height':height,'encoded_fps':encoded_fps,
            'capture_fps':float(effective_capture_fps),
            'requested_capture_fps':requested_capture_fps,
            'capture_mode':capture_mode,
            'frame_count':frame_count,'duration_s':duration,
            'frame_times_s':frame_times,'timing_source':timing_source
        },
        'status':'processing','warnings':[]
    }
    if timing_warning:
        result['warnings'].append(timing_warning)
    _notify(progress,'Finding the selected golf ball',22)
    ball=detect_stationary_ball(path,frame_count,ball_hint=ball_hint)
    if not ball:
        result.update(status='ball_not_found', ball=None, impact=None, metrics={})
        result['warnings'].append('Golf ball could not be locked automatically. Use brighter lighting and keep the ball clearly visible.')
        return result
    result['ball']=ball
    _notify(progress,'Detecting impact',42)
    impact=detect_impact(path,ball,frame_count)
    if not impact:
        result.update(status='impact_not_found',impact=None,metrics={})
        result['warnings'].append('Ball was found, but impact/disappearance was not detected.')
        return result
    result['impact']=impact
    # Return an impact still so the TrackMan-style result can render even if a browser
    # cannot directly play an iPhone MOV container.
    cap=cv2.VideoCapture(path)
    still=_frame_at(cap,impact['contact_frame'])
    cap.release()
    if still is not None:
        sh,sw=still.shape[:2]
        if sw>1280:
            scale=1280/sw; still=cv2.resize(still,(1280,int(sh*scale)),interpolation=cv2.INTER_AREA)
        ok,jpg=cv2.imencode('.jpg',still,[int(cv2.IMWRITE_JPEG_QUALITY),82])
        if ok:
            result['impact_image']='data:image/jpeg;base64,'+base64.b64encode(jpg.tobytes()).decode('ascii')
    _notify(progress,'Tracking initial ball flight',64)
    bt=track_ball(path,ball,impact,float(effective_capture_fps),frame_count,frame_times)
    _notify(progress,'Tracking the clubhead',82)
    ct=track_club(path,ball,impact,float(effective_capture_fps),frame_count,frame_times)
    result['ball_track']=bt; result['club_track']=ct

    ball_speed=bt.get('ball_speed_mph'); launch=bt.get('launch_angle_deg')
    club_speed=ct.get('club_speed_mph'); attack=ct.get('attack_angle_deg')
    smash=(ball_speed/club_speed) if ball_speed and club_speed and club_speed>0 else None
    if smash is not None and not (0.7<=smash<=1.65): smash=None

    # Side-on camera check: for a launch angle we need the target line to be predominantly horizontal in the image.
    camera_geometry='unknown'
    if len(bt.get('points',[]))>=4:
        pts=bt['points'][:min(8,len(bt['points']))]
        dx=abs(pts[-1]['x']-pts[0]['x']); dy=abs(pts[-1]['y']-pts[0]['y'])
        # With a side-on phone, the early launch vector should have a strong horizontal
        # component.  A mostly vertical image-plane trace means the ball is travelling
        # primarily into the image (down-the-line camera), where 2-D scale is invalid.
        camera_geometry='side_on_ok' if dx>=dy*0.60 else 'not_side_on'
        if camera_geometry=='not_side_on':
            result['warnings'].append('Ball and impact were found. This image-plane trajectory cannot establish true 3D speed or launch angle without camera calibration. Video replay is available; use side-on footage for the current measurement method, or enter independent launch-monitor readings to simulate a shot.')
            launch=None
            ball_speed=None
    if len(bt.get('points',[]))<3:
        result['warnings'].append('Too few clean post-impact ball frames were detected for a dependable measured ball speed/trace.')
    if bt.get('confidence',0)<0.55:
        ball_speed=None
    if ct.get('confidence',0)<0.55:
        club_speed=None; attack=None
    if ball_speed is None or club_speed is None:
        smash=None

    result['camera_geometry']=camera_geometry
    # These values are useful tracker diagnostics, but are not user-facing
    # measurements because the server has no marked real-world reference yet.
    result['tracking_diagnostics']={
        'ball_speed_mph':ball_speed,
        'club_speed_mph':club_speed,
        'smash_factor':smash,
        'launch_angle_deg':launch,
        'attack_angle_deg':attack,
    }
    result['metrics']={}
    confs=[ball.get('confidence',0),impact.get('confidence',0)]
    if bt.get('confidence'): confs.append(bt['confidence'])
    overall=float(np.mean(confs)) if confs else 0
    result['confidence']=overall
    result['status']='trace_only'
    result['measurement_status']='video_only'
    result['measurement_source']='Requires marked scale and camera-plane confirmation'
    result['replay']={'start_frame':max(0,impact['contact_frame']-10),'impact_frame':impact['contact_frame'],'end_frame':min(frame_count-1,(bt.get('points') or [{'frame':impact['contact_frame']}])[-1]['frame']+12)}
    _notify(progress,'Preparing calibrated result',96)
    return result
