/**
 * MOCK MODE ONLY. The NACE list the API serves (`GET /api/reference/wizard`, `ref.nace_code`
 * catalogue NACE2.1-TR-v1, API migration 0010, step 25), copied so the in-browser demo can answer
 * `Api.reference()` without a backend. Screens never read this file: they read
 * `store.reference()`, which in HTTP mode comes from the API. Keep it equal to migration 0010.
 */
export const NACE: Record<string, { title: string; translationKey: string }> = {
  '58.21.01': { title: 'Video oyunu yayımlama', translationKey: 'nace.video_game_publishing' },
  '58.29.01': { title: 'Yazılım yayımlama', translationKey: 'nace.software_publishing' },
  '62.10.00': { title: 'Yazılım ve bilgisayar programlama', translationKey: 'nace.software_programming' },
  '62.20.00': { title: 'Bilgi teknolojileri ve siber güvenlik danışmanlığı', translationKey: 'nace.it_cybersecurity_consulting' },
  '62.90.99': { title: 'Diğer bilgi teknolojileri hizmetleri', translationKey: 'nace.other_it_services' },
  '63.10.00': { title: 'Bulut bilişim, barındırma ve veri işleme', translationKey: 'nace.cloud_hosting_data_processing' },
  '63.91.02': { title: 'Web arama portalları', translationKey: 'nace.web_search_portals' },
  '63.92.00': { title: 'Diğer bilgi hizmetleri', translationKey: 'nace.other_information_services' },
};

/** "Şirketin amacı ve konusu; …" built from the chosen activities (code and title, from the reference). */
export function companyPurpose(items: { code: string; title: string }[]) {
  if (!items.length) return 'Faaliyet kodu seçtiğinizde şirket konusu burada oluşturulur.';
  const parts = items.map((n) => `${n.title.toLocaleLowerCase('tr-TR')} (${n.code})`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ile ${parts.at(-1)}` : parts[0];
  return `Şirketin amacı ve konusu; ${list} başta olmak üzere, bu amaçlarla ilgili her türlü yazılım geliştirme, lisanslama ve bulut hizmeti sunmaktır.`;
}
