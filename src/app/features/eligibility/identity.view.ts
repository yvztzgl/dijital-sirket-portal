import { identityView } from '@core/reference/timeline';

/**
 * What the founder is told to do and not to do during the camera check; shown on D-2a's
 * pre-information view and on the phone page. Placeholders until the KYC vendor's capture rules
 * are known (PROJECT_LOG, 2026-11-17 twenty-second entry).
 */
export const KYC_RULES = {
  do: ['Pasaportun fotoğraflı sayfasını çerçeveye tam yerleştiriniz.', 'Yüzünüzü açık ve tam görünür tutunuz.', 'Doğrulama tamamlanana kadar kameranın karşısında kalınız.'],
  dont: ['Güneş gözlüğü, şapka veya maske takmayınız.', 'Pasaportun fotokopisini veya ekran görüntüsünü göstermeyiniz.', 'Kadrajda başka bir kişi bulundurmayınız.'],
};

const PROMPTS = ['Başınızı çeviriniz', 'Göz kırpınız', 'Gülümseyiniz'];

/**
 * What the camera area shows at this moment of the check; the same on the computer and on the phone
 * page. The camera is the portal's own animation in both modes (no identity vendor yet). When it
 * ends, the mock has decided already; with the server (`serverDecides`) the API's Worker decides
 * after it, so the end says the result is awaited, not that the identity was verified.
 */
export function cameraView(e: ReturnType<typeof identityView>, serverDecides = false) {
  const face = e.passportRead && !e.identityDone;
  const doneTitle = serverDecides ? 'Doğrulama sonucu bekleniyor' : 'Kimliğiniz doğrulandı';
  return {
    title: !e.passportRead ? 'Pasaportunuzu kameraya gösteriniz' : face ? 'Yüzünüzü çerçevenin içinde tutunuz' : doneTitle,
    view: (!e.passportRead ? 'passport' : face ? 'face' : 'wait') as 'passport' | 'face' | 'wait',
    prompt: e.liveness < 0 ? 'Yüzünüzü çerçeveye yerleştiriniz' : (PROMPTS[e.liveness] ?? ''),
    chips: PROMPTS.map((t, i) => ({ t, done: e.liveness > i, cur: e.liveness === i })),
    waitTitle: doneTitle,
    wait: serverDecides ? 'Sonuç birkaç saniye içinde gösterilir.' : 'Bir sonraki aşamaya geçiliyor.',
  };
}

/** The passport's machine-readable name line as the camera view draws it: "SURNAME<<GIVEN<<<…", 30 characters. */
export function mrzName(firstName = '', lastName = '') {
  const part = (x: string) => x.toLocaleUpperCase('en-US').replace(/[^A-Z]/g, '');
  return `${part(lastName)}<<${part(firstName)}`.padEnd(30, '<').slice(0, 30);
}
