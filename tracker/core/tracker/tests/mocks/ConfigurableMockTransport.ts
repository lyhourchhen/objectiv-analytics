import { TrackerTransport } from '../../src';

export class ConfigurableMockTransport implements TrackerTransport {
  readonly transportName = 'ConfigurableMockTransport';
  _isUsable: boolean;

  constructor({ isUsable }: { isUsable: boolean }) {
    this._isUsable = isUsable;
  }

  async handle(): Promise<any> {
    console.log('MockTransport.handle');
  }

  isUsable(): boolean {
    return this._isUsable;
  }
}
