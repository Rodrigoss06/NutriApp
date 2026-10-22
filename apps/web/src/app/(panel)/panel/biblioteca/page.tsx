import { redirect } from 'next/navigation';

/** La Biblioteca abre en Alimentos. */
export default function LibraryPage() {
  redirect('/panel/biblioteca/alimentos');
}
