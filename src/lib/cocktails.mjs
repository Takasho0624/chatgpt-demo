export const cocktails = {
  1: {
    displayName: 'マティーニ',
    speechName: 'マティーニ',
    src: '/cocktails/1_martini.png',
  },

  2: {
    displayName: 'マンハッタン',
    speechName: 'マンハッタン',
    src: '/cocktails/2_manhattan.png',
  },

  3: {
    displayName: 'ギムレット',
    speechName: 'ギムレット',
    src: '/cocktails/3_gimlet.png',
  },

  4: {
    displayName: 'ダイキリ',
    speechName: 'ダイキリ',
    src: '/cocktails/4_daiquiri.png',
  },

  5: {
    displayName: 'サイドカー',
    speechName: 'サイドカー',
    src: '/cocktails/5_sidecar.png',
  },

  6: {
    displayName: 'ホワイトレディ',
    speechName: 'ホワイトレディ',
    src: '/cocktails/6_white-lady.png',
  },

  7: {
    displayName: 'ネグローニ',
    speechName: 'ネグローニ',
    src: '/cocktails/7_negroni.png',
  },

  8: {
    displayName: 'オールドファッションド',
    speechName: 'オールドファッションド',
    src: '/cocktails/8_old-fashioned.png',
  },

  9: {
    displayName: 'ジントニック',
    speechName: 'ジントニック',
    src: '/cocktails/9_gin-tonic.png',
  },

  10: {
    displayName: 'モスコミュール',
    speechName: 'モスコミュール',
    src: '/cocktails/10_moscow-mule.png',
  },

  11: {
    displayName: 'カシスオレンジ',
    speechName: 'カシスオレンジ',
    src: '/cocktails/11_cassis-orange.png',
  },

  12: {
    displayName: 'ファジーネーブル',
    speechName: 'ファジーネーブル',
    src: '/cocktails/12_fuzzy-navel.png',
  },
}

export const cocktailSpeechInstructions = `カクテル名は英語の綴りを読まず、次の日本語の読み方で自然に発音してください。\n${Object.entries(cocktails).map(([number, cocktail]) => `${number}番：${cocktail.speechName}`).join('\n')}`
