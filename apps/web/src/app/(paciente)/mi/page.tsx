import { redirect } from 'next/navigation';

/** /mi abre «Hoy»: así el inicio queda dentro del alcance /mi/ del service worker. */
export default function PatientRootPage() {
  redirect('/mi/hoy');
}
