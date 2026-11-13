import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  isAssessmentPath,
  enterAssessmentFullscreen,
  exitAssessmentFullscreen,
  toggleAssessmentFullscreen,
} from './assessmentDisplay.js';

afterEach(async () => {
  await exitAssessmentFullscreen();
  delete globalThis.document;
});

test('matches Record and Live assessment aliases without matching editors or lists', () => {
  for (const path of [
    '/quizzes/12', '/assignments/12/submit', '/lms/quiz/12', '/lms/quizzes/12/',
    '/lms/quizzes/12/moli', '/lms/assignment/12/submit', '/lms/assignments/12/submit',
    '/lms/courses/1/classes/2/quizzes/12', '/lms/courses/1/classes/2/assignments/12/submit',
  ]) assert.equal(isAssessmentPath(path), true, path);
  for (const path of [
    '/lms/assignments', '/lms/quizzes/gallery', '/lms/quizzes/gallery/',
    '/lms/teach/quizzes/12/edit', '/lms/teacher/quizzes/new', '/admin/quizzes/12/edit',
    '/lms/courses/1/classes/2/sessions/3', '/video-courses/1',
  ]) assert.equal(isAssessmentPath(path), false, path);
});

test('requests synchronously during the launch click and exits only owned fullscreen', async () => {
  let requests = 0;
  let exits = 0;
  globalThis.document = {
    documentElement: { requestFullscreen() { requests++; document.fullscreenElement = this; } },
    exitFullscreen() { exits++; document.fullscreenElement = null; },
  };
  enterAssessmentFullscreen();
  assert.equal(requests, 1);
  enterAssessmentFullscreen();
  assert.equal(requests, 1);
  await exitAssessmentFullscreen();
  assert.equal(exits, 1);
  document.fullscreenElement = document.documentElement;
  enterAssessmentFullscreen();
  await exitAssessmentFullscreen();
  assert.equal(exits, 1, 'preserves fullscreen that was active before opening the assessment');
});

test('leaving before a pending fullscreen request resolves still exits it', async () => {
  let finish;
  globalThis.document = {
    documentElement: { requestFullscreen() { return new Promise(resolve => { finish = () => { document.fullscreenElement = this; resolve(); }; }); } },
    exitFullscreen() { document.fullscreenElement = null; },
  };
  enterAssessmentFullscreen();
  const leaving = exitAssessmentFullscreen();
  finish();
  await leaving;
  assert.equal(document.fullscreenElement, null);
});

test('unsupported and denied fullscreen never block navigation', async () => {
  globalThis.document = { documentElement: {} };
  assert.doesNotThrow(() => enterAssessmentFullscreen());
  document.documentElement.requestFullscreen = () => Promise.reject(new Error('Denied'));
  enterAssessmentFullscreen();
  await exitAssessmentFullscreen();
  document.documentElement.requestFullscreen = () => { throw new Error('Unsupported'); };
  assert.doesNotThrow(() => enterAssessmentFullscreen());
});

test('modified link clicks do not fullscreen the original tab', () => {
  let requests = 0;
  globalThis.document = { documentElement: { requestFullscreen() { requests++; } } };
  for (const event of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    enterAssessmentFullscreen(event);
  }
  assert.equal(requests, 0);
});

test('supports WebKit fullscreen methods', async () => {
  globalThis.document = {
    documentElement: { webkitRequestFullscreen() { document.webkitFullscreenElement = this; } },
    webkitExitFullscreen() { document.webkitFullscreenElement = null; },
  };
  enterAssessmentFullscreen();
  assert.equal(document.webkitFullscreenElement, document.documentElement);
  await toggleAssessmentFullscreen();
  assert.equal(document.webkitFullscreenElement, null);
});
