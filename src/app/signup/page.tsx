import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import AuthForm from '@/components/AuthForm'

export default function SignupPage() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  )
}

async function Gate() {
  if (await currentUser()) redirect('/')
  return <AuthForm mode="signup" />
}
