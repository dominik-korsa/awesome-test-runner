import util from 'util';
import cp from 'child_process';
import path from 'path';

const execPromise = util.promisify(cp.exec);

export interface ResultSuccess {
  type: 'success';
  output: string;
  time: number;
}

export interface ResultRuntimeError {
  type: 'runtime-error';
  message: string;
}

export interface ResultTimeoutError {
  type: 'timeout';
}

export type Result = ResultSuccess | ResultRuntimeError | ResultTimeoutError;

export enum Language {
  Python,
  Cpp,
}

export class Runner {
  private containerId?: string;

  private language?: Language;

  public async start(): Promise<void> {
    if (this.containerId !== undefined) return;
    this.containerId = (await execPromise('docker run -d -i --rm dominikkorsa/runner:1.0.0')).stdout.trim();
  }

  public async kill(): Promise<void> {
    if (this.containerId === undefined) return;
    await execPromise(`docker kill ${this.containerId}`);
    this.containerId = undefined;
    this.language = undefined;
  }

  public async sendCode(file: string): Promise<void> {
    if (this.containerId === undefined) throw new Error('Container not started');

    const ext = path.extname(file);
    if (ext === '.cpp') this.language = Language.Cpp;
    else if (ext === '.py') this.language = Language.Python;
    else throw new Error(`Unknown extension ${ext}`);

    if (this.language === Language.Cpp) {
      await execPromise(`docker cp ${path.resolve(file)} ${this.containerId}:/tmp/code.cpp`);
      await execPromise(`docker exec ${this.containerId} g++ /tmp/code.cpp -o /tmp/code`);
    } else {
      await execPromise(`docker cp ${path.resolve(file)} ${this.containerId}:/tmp/code.py`);
    }
  }

  public async testInputFile(inputFile: string, timeout: number): Promise<Result> {
    if (this.containerId === undefined) throw new Error('Container not started');
    if (this.language === undefined) throw new Error('Code not sent');
    try {
      await execPromise(`docker cp ${path.resolve(inputFile)} ${this.containerId}:/tmp/input.txt`);
      let command: string;
      if (this.language === Language.Cpp) command = '/tmp/code';
      else command = 'python /tmp/code.py';
      const { stdout } = await execPromise(`docker exec ${this.containerId} python /var/runner.py -t ${timeout} ${command}`);
      return JSON.parse(stdout) as Result;
    } catch (error) {
      return {
        type: 'runtime-error',
        message: error.message,
      };
    }
  }

  public isStarted(): boolean {
    return this.containerId !== undefined;
  }
}
