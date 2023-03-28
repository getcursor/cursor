import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import zh from './locales/zh.json'
import hi from './locales/hi.json'

export const localeOptions = {
    'English': 'en',
    '中文': 'zh',
    'हिंदी': 'hi',
}

export type Languages = keyof typeof localeOptions

export function init (locale: Languages) {
    const lng = localeOptions[locale];
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
            zh: { translation: zh },
            hi: { translation: hi },
        }
    })
}

