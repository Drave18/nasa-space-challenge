import type { MissionLesson } from './lesson';

export type ModelTourView = 'front' | 'side' | 'top';
export interface ModelTourStop { view: ModelTourView; title: string; description: string; source: string }
export type ModelTour = readonly [ModelTourStop, ModelTourStop, ModelTourStop];

export function firstSentence(paragraph: string): string {
  const text = paragraph.trim();
  return /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
}

export function buildModelTour(lesson: Pick<MissionLesson, 'craft' | 'learned' | 'sources'>): ModelTour {
  return [
    { view: 'front', title: 'Front profile', description: firstSentence(lesson.craft[0]), source: lesson.sources.craft },
    { view: 'side', title: 'Side profile', description: firstSentence(lesson.craft[1]), source: lesson.sources.craft },
    { view: 'top', title: 'Overhead view', description: firstSentence(lesson.learned[0]), source: lesson.sources.learned },
  ];
}
