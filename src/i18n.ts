import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'

import en from './locales/en.json'
import zh from './locales/zh.json'
import hi from './locales/hi.json'

export const localeOptions = {
    'English': 'en',
    '中文': 'zh',
    'हिंदी': 'hi',
}

export type Languages = keyof typeof localeOptions

export const init = (locale: Languages = 'English') => {
    const lng = localeOptions[locale];
    i18n
    .use(initReactI18next)
    .use(HttpBackend)
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
    return i18n;
}