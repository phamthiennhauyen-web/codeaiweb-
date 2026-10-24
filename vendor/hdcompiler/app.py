import os
import sys
import tempfile
import subprocess
import json
import re
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

def strip_ansi(text):
    return ansi_escape.sub('', text)

def run_compiler(mode, code, fmt):
    compiler_dir = os.path.join(BASE_DIR, '580vnx') if mode == '580' else os.path.join(BASE_DIR, '880btg')
    compiler_script = os.path.join(compiler_dir, 'compiler_.py')

    if not os.path.exists(compiler_script):
        return '', f"Compiler not found at {compiler_script}"

    with tempfile.NamedTemporaryFile(mode='w', suffix='.asm', delete=False, encoding='utf-8') as f:
        f.write(code)
        asm_path = f.name

    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'

    try:
        proc = subprocess.run(
            [sys.executable, compiler_script, '-f', fmt],
            cwd=compiler_dir,
            input=code,
            capture_output=True,
            text=True,
            timeout=30,
            env=env
        )
        stdout = strip_ansi(proc.stdout or '')
        stderr = strip_ansi(proc.stderr or '')
        return stdout, stderr
    except subprocess.TimeoutExpired:
        return '', 'Compilation timed out'
    except Exception as e:
        return '', str(e)
    finally:
        try:
            os.unlink(asm_path)
        except:
            pass

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/compile', methods=['POST'])
def compile_code():
    data = request.get_json()
    mode = data.get('mode', '580')
    code = data.get('code', '')
    fmt = data.get('format', 'hex')

    stdout, stderr = run_compiler(mode, code, fmt)

    return jsonify({
        'stdout': stdout,
        'stderr': stderr,
        'mode': mode,
        'format': fmt
    })

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
