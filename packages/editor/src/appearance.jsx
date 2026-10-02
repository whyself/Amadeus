import React, { useState } from 'react';
import { IconLightOutlineMedium, IconDarkOutlineMedium, IconFollowsystemOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives';

const key = 'amadeus.editor.appearance';
const modes = ['light', 'dark', 'system'];
const icons = { light: IconLightOutlineMedium, dark: IconDarkOutlineMedium, system: IconFollowsystemOutlineMedium };

export function editorAppearance() {
  try { const value = localStorage.getItem(key); return modes.includes(value) ? value : 'system'; }
  catch { return 'system'; }
}

export function resolvedEditorAppearance() {
  const mode = editorAppearance();
  return mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
}

function EditorAppearance({ t }) {
  const [mode, setMode] = useState(editorAppearance);
  return <div className="amadeus-editor-appearance">
    <div className="amadeus-editor-appearance-title">{t('appearance.title')}</div>
    <div className="amadeus-editor-appearance-options">{modes.map(value => { const Icon = icons[value]; return <button type="button" key={value} aria-pressed={mode === value} onClick={() => {
      try { localStorage.setItem(key, value); } catch {}
      setMode(value);
      window.dispatchEvent(new Event('amadeus:editor-appearance'));
    }}><Icon />{t(`appearance.${value}`)}</button>; })}</div>
  </div>;
}

export function installEditorAppearance(ctx) {
  const namespace = 'amadeus.editor.appearance';
  const unreg = ctx.locale.register(namespace, {
    zh: { 'appearance.title': '编辑器外观', 'appearance.light': '浅色', 'appearance.dark': '深色', 'appearance.system': '跟随系统' },
    en: { 'appearance.title': 'Editor appearance', 'appearance.light': 'Light', 'appearance.dark': 'Dark', 'appearance.system': 'System' },
  });
  const unslot = ctx.slots.inject('settings.general.item', () => ctx.slots.register({ name: 'settings.general.item', id: 'amadeus-editor-appearance', order: 10.5, locale: namespace }, EditorAppearance));
  return () => { unslot(); unreg(); };
}
