import type { BaseAtsApplyAdapter } from './base-adapter';
import { GreenhouseApplyAdapter } from './greenhouse-adapter';
import { LeverApplyAdapter } from './lever-adapter';
import { AshbyApplyAdapter } from './ashby-adapter';
import { WorkableApplyAdapter } from './workable-adapter';
import { SmartRecruitersApplyAdapter } from './smartrecruiters-adapter';
import { WorkdayApplyAdapter } from './workday-adapter';
import type { JobPlatform } from '../../plugins';

export class ApplyAdapterRegistry {
  private readonly adapters: BaseAtsApplyAdapter[] = [];

  constructor() {
    this.register(new GreenhouseApplyAdapter());
    this.register(new LeverApplyAdapter());
    this.register(new AshbyApplyAdapter());
    this.register(new WorkableApplyAdapter());
    this.register(new SmartRecruitersApplyAdapter());
    this.register(new WorkdayApplyAdapter());
  }

  public register(adapter: BaseAtsApplyAdapter): void {
    this.adapters.push(adapter);
  }

  public findForUrl(url: string): BaseAtsApplyAdapter | undefined {
    return this.adapters.find((adapter) => adapter.canHandle(url));
  }

  public findForPlatform(platform: JobPlatform): BaseAtsApplyAdapter | undefined {
    return this.adapters.find((adapter) => adapter.platform === platform);
  }

  public getAll(): readonly BaseAtsApplyAdapter[] {
    return this.adapters;
  }
}

