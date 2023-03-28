import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

export const localeOptions = {
    'English': 'en',
    '中文': 'zh',
    '日本語': 'ja'
}

export type Languages = keyof typeof localeOptions

export function init (lng: string) {
    i18n
    .use(initReactI18next)
    .init({
        lng,
        fallbackLng: lng,
        interpolation: {
            escapeValue: false,
        },
        resources: {
            en: { translation: en },
            ja: { translation: ja },
            zh: { translation: zh },
        }
    });
}

