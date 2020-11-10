import { expect, use } from 'chai';
import path from 'path';
import fse from 'fs-extra';
import eol from 'eol';
import chaiAsPromised from 'chai-as-promised';
import {
  CodeNotSentError,
  ContainerNotStartedError,
  isDockerAvailable,
  isImagePulled,
  Language,
  pullContainerImage,
  ResultSuccess,
  Runner,
  UnknownExtensionError,
} from '../src';

use(chaiAsPromised);

const res = path.resolve(__dirname, './resources');
const temp = path.resolve(__dirname, './temp');

function resFile(file: string) {
  return path.resolve(res, file);
}

function readResFile(file: string): Promise<string> {
  return fse.readFile(resFile(file), 'utf-8');
}

function tempFile(file: string): string {
  return path.resolve(temp, file);
}

function readTempFile(file: string): Promise<string> {
  return fse.readFile(tempFile(file), 'utf-8');
}

function expectOutputEquals(out1: string, out2: string) {
  expect(eol.lf(out1).trimEnd()).to.equal(eol.lf(out2).trimEnd());
}

describe('Run tests', () => {
  const runner = new Runner();

  before(() => {
    fse.emptyDir(temp);
  });

  it('Test Docker available', async () => {
    expect(await isDockerAvailable()).to.equal(true);
  });

  it('Pull docker image', async function () {
    this.slow(30000);
    this.timeout(300000);
    await pullContainerImage();
    expect(await isImagePulled()).to.equal(true);
  });

  it('Container not started errors', async () => {
    expect(runner.isStarted()).to.equal(false);
    await expect(runner.sendCodeFile(resFile('code/1-valid.cpp')))
      .to.eventually.be.rejectedWith(ContainerNotStartedError);
    await expect(runner.sendCodeText('print(input())', Language.Python))
      .to.eventually.be.rejectedWith(ContainerNotStartedError);
    await expect(runner.getOutputAsText('/tmp/outputs/example.out'))
      .to.eventually.be.rejectedWith(ContainerNotStartedError);
    await expect(runner.saveOutput('/tmp/outputs/example.out', tempFile('not-started-output.out')))
      .to.eventually.be.rejectedWith(ContainerNotStartedError);
    await expect(runner.testInputFile(resFile('input/1.in'), 30))
      .to.eventually.be.rejectedWith(ContainerNotStartedError);
    expect(runner.isStarted()).to.equal(false);
    await expect(runner.kill()).to.be.fulfilled;
  });

  it('Start runner', async function () {
    this.slow(10000);
    this.timeout(90000);
    await runner.start();
    expect(runner.isStarted()).to.equal(true);
  });

  it('Start runner again', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    await runner.start();
    expect(runner.isStarted()).to.equal(true);
  });

  it('Unknown extension error', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    await expect(runner.sendCodeFile(resFile('code/1-valid.pas')))
      .to.eventually.be.rejectedWith(UnknownExtensionError);
  });

  it('Code not sent error', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    await expect(runner.testInputFile(resFile('input/2.in'), 30))
      .to.eventually.be.rejectedWith(CodeNotSentError);
  });

  it('Send valid C++ code', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(5000);
    this.timeout(90000);
    await runner.sendCodeFile(resFile('code/1-valid.cpp'));
  });

  it('Report success, save output to file', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(5000);
    this.timeout(90000);
    const result = await runner.testInputFile(resFile('input/1.in'), 30) as ResultSuccess;
    expect(result).property('type').to.equal('success');
    await runner.saveOutput(result.outputContainerPath, tempFile('test.out'));
    expectOutputEquals(await readTempFile('test.out'), await readResFile('expected-output/1.out'));
  });

  it('Report success on second test, get output as text', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(5000);
    this.timeout(90000);
    const result = await runner.testInputFile(resFile('input/2.in'), 30) as ResultSuccess;
    expect(result).property('type').to.equal('success');
    const output = await runner.getOutputAsText(result.outputContainerPath);
    expectOutputEquals(output, await readResFile('expected-output/2.out'));
  });

  it('C++ runtime error', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(10000);
    this.timeout(90000);
    await runner.sendCodeFile(resFile('code/1-error.cpp'));
    const result = await runner.testInputFile(resFile('input/1.in'), 30);
    expect(result).property('type').to.equal('runtime-error');
  });

  it('C++ timeout - code as text', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(20000);
    this.timeout(90000);
    const code = await readResFile('code/1-timeout.cpp');
    await runner.sendCodeText(code, Language.Cpp);
    const result = await runner.testInputFile(resFile('input/1.in'), 5);
    expect(result).property('type').to.equal('timeout');
  });

  it('Python success - code as text', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(10000);
    this.timeout(90000);
    const code = await readResFile('code/1-valid.py');
    await runner.sendCodeText(code, Language.Python);
    const result = await runner.testInputFile(resFile('input/2.in'), 5);
    expect(result).property('type').to.equal('success');
  });

  it('Python runtime error', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(10000);
    this.timeout(90000);
    await runner.sendCodeFile(resFile('code/1-error.py'));
    const result = await runner.testInputFile(resFile('input/2.in'), 30);
    expect(result).property('type').to.equal('runtime-error');
  });

  it('Python timeout', async function () {
    if (!runner.isStarted()) {
      this.skip();
      return;
    }
    this.slow(20000);
    this.timeout(90000);
    await runner.sendCodeFile(resFile('code/1-timeout.py'));
    const result = await runner.testInputFile(resFile('input/2.in'), 5);
    expect(result).property('type').to.equal('timeout');
  });

  it('Kill runner', async function () {
    if (!runner.isStarted()) return;
    this.slow(5000);
    this.timeout(90000);
    await runner.kill();
    expect(runner.isStarted()).to.equal(false);
  });
});
