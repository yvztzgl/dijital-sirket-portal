/** A practical subset of NACE Rev.2 activity codes for tech and service start-ups. */
export const NACE: Record<string, string> = {
  '58.21': 'Bilgisayar oyunlarının yayımlanması',
  '58.29': 'Diğer yazılım programlarının yayımlanması',
  '59.11': 'Sinema filmi, video ve televizyon programı yapımı',
  '62.01': 'Bilgisayar programlama faaliyetleri',
  '62.02': 'Bilgisayar danışmanlık faaliyetleri',
  '62.03': 'Bilgisayar tesisleri yönetim faaliyetleri',
  '62.09': 'Diğer bilgi teknolojisi ve bilgisayar hizmet faaliyetleri',
  '63.11': 'Veri işleme, barındırma ve ilgili faaliyetler',
  '63.12': 'Web portalları',
  '63.99': 'Başka yerde sınıflandırılmamış diğer bilgi hizmet faaliyetleri',
  '46.51': 'Bilgisayar, bilgisayar çevre birimleri ve yazılımlarının toptan ticareti',
  '47.91': 'Posta yoluyla veya internet üzerinden yapılan perakende ticaret',
  '64.19': 'Diğer parasal aracılık faaliyetleri',
  '66.19': 'Finansal hizmet faaliyetleri için yardımcı diğer faaliyetler',
  '70.22': 'İşletme ve diğer idari danışmanlık faaliyetleri',
  '71.12': 'Mühendislik faaliyetleri ve ilgili teknik danışmanlık',
  '72.19': 'Doğal bilimler ve mühendislikle ilgili diğer araştırma ve deneysel geliştirme',
  '73.11': 'Reklam ajanslarının faaliyetleri',
  '73.20': 'Piyasa ve kamuoyu araştırması faaliyetleri',
  '74.10': 'Uzmanlaşmış tasarım faaliyetleri',
  '74.90': 'Başka yerde sınıflandırılmamış diğer mesleki, bilimsel ve teknik faaliyetler',
  '82.99': 'Başka yerde sınıflandırılmamış diğer iş destek hizmet faaliyetleri',
  '85.59': 'Başka yerde sınıflandırılmamış diğer eğitim',
  '86.90': 'İnsan sağlığı ile ilgili diğer hizmetler',
};

export const naceName = (code: string) => NACE[code] ?? 'Faaliyet';

export function searchNace(q: string, exclude: string[] = [], limit = 5) {
  const t = q.trim().toLocaleLowerCase('tr-TR');
  if (!t) return [];
  return Object.entries(NACE)
    .filter(([c, n]) => !exclude.includes(c) && (c.startsWith(t) || n.toLocaleLowerCase('tr-TR').includes(t)))
    .slice(0, limit)
    .map(([code, name]) => ({ code, name }));
}

/** "Şirketin amacı ve konusu; …" built from the chosen activity codes. */
export function companyPurpose(codes: string[]) {
  if (!codes.length) return 'Faaliyet kodu seçtiğinizde şirket konusu burada oluşturulur.';
  const parts = codes.map((c) => `${naceName(c).toLocaleLowerCase('tr-TR')} (${c})`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ile ${parts.at(-1)}` : parts[0];
  return `Şirketin amacı ve konusu; ${list} başta olmak üzere, bu amaçlarla ilgili her türlü yazılım geliştirme, lisanslama ve bulut hizmeti sunmaktır.`;
}
