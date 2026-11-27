import { identityView } from '@core/reference/timeline';
import { cameraView, KYC_RULES, mrzName } from './identity.view';

describe('identity view', () => {
  it('cameraView: passport, then the three face prompts, then the end', () => {
    expect(cameraView(identityView(0))).toMatchObject({ title: 'Pasaportunuzu kameraya gösteriniz', view: 'passport', prompt: 'Yüzünüzü çerçeveye yerleştiriniz' });
    const face = cameraView(identityView(0.55));
    expect(face).toMatchObject({ title: 'Yüzünüzü çerçevenin içinde tutunuz', view: 'face', prompt: 'Göz kırpınız' });
    expect(face.chips).toEqual([
      { t: 'Başınızı çeviriniz', done: true, cur: false },
      { t: 'Göz kırpınız', done: false, cur: true },
      { t: 'Gülümseyiniz', done: false, cur: false },
    ]);
    expect(cameraView(identityView(1))).toMatchObject({ title: 'Kimliğiniz doğrulandı', view: 'wait', prompt: '', waitTitle: 'Kimliğiniz doğrulandı', wait: 'Bir sonraki aşamaya geçiliyor.' });
  });

  it('cameraView with the server deciding: the end says the result is awaited', () => {
    expect(cameraView(identityView(1), true)).toMatchObject({ title: 'Doğrulama sonucu bekleniyor', waitTitle: 'Doğrulama sonucu bekleniyor', wait: 'Sonuç birkaç saniye içinde gösterilir.' });
    expect(cameraView(identityView(0.1), true).title).toBe('Pasaportunuzu kameraya gösteriniz');
  });

  it('mrzName: surname and given name in Latin capitals, other letters dropped, 30 characters', () => {
    expect(mrzName('Ayşe', 'Kaya-Berg')).toBe('KAYABERG<<AYE'.padEnd(30, '<'));
    expect(mrzName()).toBe('<'.repeat(30));
    expect(mrzName('A'.repeat(20), 'B'.repeat(20))).toBe(`${'B'.repeat(20)}<<${'A'.repeat(8)}`);
  });

  it('KYC_RULES: three do\'s and three don\'ts', () => {
    expect(KYC_RULES.do.length).toBe(3);
    expect(KYC_RULES.dont.length).toBe(3);
  });
});
