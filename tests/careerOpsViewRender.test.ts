import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CareerOpsView } from '../src/components/careerOps/CareerOpsView';
import { useCareerOpsStore } from '../src/store/useCareerOpsStore';
import { CompanyOutreachStudio } from '../src/components/careerOps/CompanyOutreachStudio';
import { JobDrawerModal } from '../src/components/careerOps/JobDrawerModal';
import { PipelineView } from '../src/components/careerOps/PipelineView';
import { NetworkView } from '../src/components/careerOps/NetworkView';
import { TodayView } from '../src/components/careerOps/TodayView';

describe('CareerOpsView Render Verification', () => {
  it('renders CareerOpsView root without crashing', () => {
    expect(() => {
      renderToString(React.createElement(CareerOpsView));
    }).not.toThrow();
  });

  it('renders TodayView without crashing even with numeric or null dates', () => {
    expect(() => {
      renderToString(
        React.createElement(TodayView, {
          onNavigateToTab: () => {},
          onSelectJob: () => {},
          onOpenAssistQueue: () => {},
        })
      );
    }).not.toThrow();
  });

  it('renders CompanyOutreachStudio without crashing', () => {
    const apps = useCareerOpsStore.getState().applications;
    expect(() => {
      renderToString(
        React.createElement(CompanyOutreachStudio, {
          applications: apps,
          activeJobId: apps[0]?.id || null,
          onSelectJob: () => {},
          onOpenAssistQueue: () => {},
          candidateName: 'Abhishek Singh',
        })
      );
    }).not.toThrow();
  });

  it('renders JobDrawerModal without crashing when closed and when open', () => {
    const apps = useCareerOpsStore.getState().applications;
    expect(() => {
      renderToString(
        React.createElement(JobDrawerModal, {
          job: apps[0] || null,
          isOpen: false,
          onClose: () => {},
        })
      );
      renderToString(
        React.createElement(JobDrawerModal, {
          job: apps[0] || null,
          isOpen: true,
          onClose: () => {},
        })
      );
    }).not.toThrow();
  });

  it('renders PipelineView without crashing', () => {
    expect(() => {
      renderToString(
        React.createElement(PipelineView, {
          onSelectJob: () => {},
          onOpenEvaluator: () => {},
          onOpenTailor: () => {},
          onOpenOutreach: () => {},
          onAddNewJob: () => {},
        })
      );
    }).not.toThrow();
  });

  it('renders NetworkView without crashing', () => {
    const apps = useCareerOpsStore.getState().applications;
    expect(() => {
      renderToString(
        React.createElement(NetworkView, {
          applications: apps,
          onOpenOutreachStudio: () => {},
          onSelectJob: () => {},
        })
      );
    }).not.toThrow();
  });
});
