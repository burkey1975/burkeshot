from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import json, os, tempfile, sys, threading, webbrowser

ROOT=Path(__file__).resolve().parent
PREFERRED_PORT=int(os.environ.get('BURKESHOT_PORT','8811'))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)

    def log_message(self,fmt,*args):
        print('[BURKESHOT]', fmt%args)

    def _save_upload(self, suffix):
        length=int(self.headers.get('Content-Length','0'))
        if length<=0 or length>700*1024*1024:
            raise ValueError('Invalid or too-large video upload')
        if not suffix.startswith('.'): suffix='.'+suffix
        work=ROOT/'_work'; work.mkdir(exist_ok=True)
        fd,path=tempfile.mkstemp(prefix='shot_',suffix=suffix,dir=str(work)); os.close(fd)
        remaining=length
        with open(path,'wb') as f:
            while remaining:
                chunk=self.rfile.read(min(1024*1024,remaining))
                if not chunk: break
                f.write(chunk); remaining-=len(chunk)
        return path

    def do_GET(self):
        if urlparse(self.path).path == '/api/health':
            try:
                import cv2, numpy
                self._json({'status':'ready','version':11,'camera_engine':True})
            except Exception as e:
                self._json({'status':'missing_engine','version':11,'camera_engine':False,'error':str(e)})
            return
        super().do_GET()

    def do_POST(self):
        parsed=urlparse(self.path)
        qs=parse_qs(parsed.query)
        suffix=self.headers.get('X-File-Ext','.mp4')
        path=None
        try:
            if parsed.path=='/api/analyze':
                try:
                    from analyzer import analyze_video
                except Exception as e:
                    self._json({'error':'Camera analysis engine is not available. Run INSTALL_CAMERA_ENGINE.bat, then restart BURKESHOT. Details: '+str(e)},503); return
                try: capture_fps=float(qs.get('capture_fps',['240'])[0])
                except: capture_fps=240.0
                capture_mode=qs.get('capture_mode',['240_slo'])[0]
                try:
                    hx=float(qs.get('ball_hint_x',['nan'])[0]); hy=float(qs.get('ball_hint_y',['nan'])[0])
                    ball_hint=(hx,hy) if 0 <= hx <= 1 and 0 <= hy <= 1 else None
                except Exception: ball_hint=None
                try: distance_factor=float(qs.get('distance_factor',['1.0'])[0])
                except Exception: distance_factor=1.0
                path=self._save_upload(suffix)
                result=analyze_video(path,capture_fps,capture_mode,ball_hint=ball_hint,distance_factor=distance_factor)
                self._json(result,200); return

            if parsed.path=='/api/coach':
                try:
                    from coach_analyzer import analyze_swing
                except Exception as e:
                    self._json({'error':'Coach analyser could not load: '+str(e)},503); return
                path=self._save_upload(suffix)
                handedness=qs.get('handedness',['right'])[0]
                view=qs.get('view',['dtl'])[0]
                result=analyze_swing(path,handedness=handedness,view=view)
                self._json(result,200); return

            self.send_error(404)
        except ValueError as e:
            self._json({'error':str(e)},400)
        except Exception as e:
            import traceback; traceback.print_exc()
            self._json({'error':str(e)},500)
        finally:
            if path:
                try: os.remove(path)
                except: pass

    def _json(self,obj,status=200):
        data=json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.end_headers(); self.wfile.write(data)

def make_server(start_port):
    last=None
    for port in range(start_port,start_port+50):
        try: return ThreadingHTTPServer(('127.0.0.1',port),Handler),port
        except OSError as e: last=e
    raise last or OSError('No local port available')

if __name__=='__main__':
    httpd,port=make_server(PREFERRED_PORT)
    url=f'http://127.0.0.1:{port}/?v=11'
    print('')
    print('BURKESHOT v11 — MAGNOLIA PRACTICE + SHOT ANALYSIS')
    print('Open:',url)
    if port!=PREFERRED_PORT:
        print(f'Port {PREFERRED_PORT} was already in use, so BURKESHOT automatically moved to {port}.')
    print('Keep this window open while using camera/coach analysis.')
    print('',flush=True)
    if '--open' in sys.argv and os.environ.get('BURKESHOT_NO_BROWSER')!='1':
        threading.Timer(0.8,lambda:webbrowser.open(url,new=2)).start()
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass
    finally: httpd.server_close()
