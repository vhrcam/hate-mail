import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'

export default function Home() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  )
}

async function Gate() {
  const user = await currentUser()
  if (!user) redirect('/login')
  return <main className="p-8">Signed in as {user.email}</main>
}
