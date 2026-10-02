import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { CardShell, SkeletonText } from './components/shared/Skeleton'

// Each portal and each emailed-link page is its own chunk, so a client or a
// specialist no longer downloads the whole admin app. A deploy deletes the old
// chunk files, so a tab still running the previous build reloads once to pick
// up the new one instead of failing on a page it has not opened yet.
const CHUNK_RELOAD_KEY = 'vfo_chunk_reload'
function lazyPage(load) {
  return lazy(() => load().then(
    mod => { try { sessionStorage.removeItem(CHUNK_RELOAD_KEY) } catch { /* private mode */ } return mod },
    err => {
      let reloaded = false
      try { reloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1' } catch { /* private mode */ }
      if (!reloaded) {
        try { sessionStorage.setItem(CHUNK_RELOAD_KEY, '1') } catch { /* private mode */ }
        window.location.reload()
        return new Promise(() => {})
      }
      throw err
    },
  ))
}

// Shown only if a page's chunk takes longer than a moment to arrive.
function RouteFallback() {
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 300); return () => clearTimeout(t) }, [])
  if (!show) return null
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px' }}>
      <CardShell><SkeletonText lines={4} /></CardShell>
    </div>
  )
}
import RolePicker from './pages/RolePicker'
import AdminLogin from './pages/AdminLogin'
import MemberLogin from './pages/MemberLogin'
const AdminPortal = lazyPage(() => import('./pages/AdminPortal'))
const MemberPortal = lazyPage(() => import('./pages/MemberPortal'))
const ClientDetail = lazyPage(() => import('./pages/ClientDetail'))

// ClientDetail captures its tab / plan deep link at mount, so a notification
// opened while already on a client page (a different client, or the same one
// with a new ?tab=) must remount it: key on the client id + the bell's _n nonce.
function KeyedClientDetail() {
  const { clientId } = useParams()
  const { search } = useLocation()
  return <ClientDetail key={`${clientId}|${new URLSearchParams(search).get('_n') || ''}`} />
}
const DecidePage = lazyPage(() => import('./pages/DecidePage'))
const TaxDecidePage = lazyPage(() => import('./pages/TaxDecidePage'))
const TaxImplementDecidePage = lazyPage(() => import('./pages/TaxImplementDecidePage'))
const TaxPostReviewDecidePage = lazyPage(() => import('./pages/TaxPostReviewDecidePage'))
const AdvisorDecidePage = lazyPage(() => import('./pages/AdvisorDecidePage'))
const AccountantDecidePage = lazyPage(() => import('./pages/AccountantDecidePage'))
const PftFtDecidePage = lazyPage(() => import('./pages/PftFtDecidePage'))
const PftDecidePage = lazyPage(() => import('./pages/PftDecidePage'))
const PftDiscoveryPage = lazyPage(() => import('./pages/PftDiscoveryPage'))
const PayPage = lazyPage(() => import('./pages/PayPage'))
const TaxPayPage = lazyPage(() => import('./pages/TaxPayPage'))
const AdvisorPayPage = lazyPage(() => import('./pages/AdvisorPayPage'))
const AccountantPayPage = lazyPage(() => import('./pages/AccountantPayPage'))
const PipPayPage = lazyPage(() => import('./pages/PipPayPage'))
const MemberSetupPage = lazyPage(() => import('./pages/MemberSetupPage'))
const SetPasswordPage = lazyPage(() => import('./pages/SetPasswordPage'))
const ForgotPasswordPage = lazyPage(() => import('./pages/ForgotPasswordPage'))
const SpecialistSifPage = lazyPage(() => import('./pages/SpecialistSifPage'))
const SpecialistPayPage = lazyPage(() => import('./pages/SpecialistPayPage'))
const SpecialistQuestionsPage = lazyPage(() => import('./pages/SpecialistQuestionsPage'))
const SpecialistDdcPage = lazyPage(() => import('./pages/SpecialistDdcPage'))
const TaxUploadPage = lazyPage(() => import('./pages/TaxUploadPage'))
const TaxIntakePage = lazyPage(() => import('./pages/TaxIntakePage'))
const TaxDepositPayPage = lazyPage(() => import('./pages/TaxDepositPayPage'))
const TaxDiagnosticPage = lazyPage(() => import('./pages/TaxDiagnosticPage'))
const VaultUploadPage = lazyPage(() => import('./pages/VaultUploadPage'))
import ClientLogin from './pages/ClientLogin'
const ClientSetupPage = lazyPage(() => import('./pages/ClientSetupPage'))
const ClientPortal = lazyPage(() => import('./pages/ClientPortal'))
import SpecialistLogin from './pages/SpecialistLogin'
const SpecialistPortal = lazyPage(() => import('./pages/SpecialistPortal'))
import TaxPlannerLogin from './pages/TaxPlannerLogin'
const TaxPlannerPortal = lazyPage(() => import('./pages/TaxPlannerPortal'))
const PlannerMemberView = lazyPage(() => import('./pages/PlannerMemberView'))
const SpecialistDdcHelpPage = lazyPage(() => import('./pages/SpecialistDdcHelpPage'))
const SpecialistRevShareFinalPage = lazyPage(() => import('./pages/SpecialistRevShareFinalPage'))
const Map4FormPage = lazyPage(() => import('./pages/Map4FormPage'))
const UpdateCardPage = lazyPage(() => import('./pages/UpdateCardPage'))
const ConnectCardPage = lazyPage(() => import('./pages/ConnectCardPage'))
const PayoutSetupPage = lazyPage(() => import('./pages/PayoutSetupPage'))
const SpecialistRevenuePayPage = lazyPage(() => import('./pages/SpecialistRevenuePayPage'))
const MembershipPayPage = lazyPage(() => import('./pages/MembershipPayPage'))
const MembershipMeetingPage = lazyPage(() => import('./pages/MembershipMeetingPage'))
const OnboardingMeetingPage = lazyPage(() => import('./pages/OnboardingMeetingPage'))
import { MemberHelpMount } from './components/member/MemberHelpButton'

export default function App() {
  return (
    <>
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<RolePicker />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/member/login" element={<MemberLogin />} />
      <Route path="/admin" element={<AdminPortal />} />
      <Route path="/admin/client/:clientId" element={<KeyedClientDetail />} />
      <Route path="/member" element={<MemberPortal />} />
      <Route path="/member/client/:clientId" element={<KeyedClientDetail />} />
      <Route path="/decide" element={<DecidePage />} />
      <Route path="/tax-decide" element={<TaxDecidePage />} />
      <Route path="/tax-implement-decide" element={<TaxImplementDecidePage />} />
      <Route path="/tax-postreview-decide" element={<TaxPostReviewDecidePage />} />
      <Route path="/advisor-decide" element={<AdvisorDecidePage />} />
      <Route path="/accountant-decide" element={<AccountantDecidePage />} />
      <Route path="/pft-ft-decide" element={<PftFtDecidePage />} />
      <Route path="/pft-decide" element={<PftDecidePage />} />
      <Route path="/pft-discovery" element={<PftDiscoveryPage />} />
      <Route path="/pay" element={<PayPage />} />
      <Route path="/tax-pay" element={<TaxPayPage />} />
      <Route path="/advisor-pay" element={<AdvisorPayPage />} />
      <Route path="/accountant-pay" element={<AccountantPayPage />} />
      <Route path="/pip-pay" element={<PipPayPage />} />
      <Route path="/update-card" element={<UpdateCardPage />} />
      <Route path="/connect-card" element={<ConnectCardPage />} />
      <Route path="/payout-setup" element={<PayoutSetupPage />} />
      <Route path="/specialist-revenue-pay" element={<SpecialistRevenuePayPage />} />
      <Route path="/membership-pay" element={<MembershipPayPage />} />
      <Route path="/membership-meeting" element={<MembershipMeetingPage />} />
      <Route path="/onboarding-meeting" element={<OnboardingMeetingPage />} />
      <Route path="/member-setup" element={<MemberSetupPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/specialist-sif" element={<SpecialistSifPage />} />
      <Route path="/map4-form" element={<Map4FormPage />} />
      <Route path="/specialist-pay" element={<SpecialistPayPage />} />
      <Route path="/specialist-questions" element={<SpecialistQuestionsPage />} />
      <Route path="/specialist-ddc" element={<SpecialistDdcPage />} />
      <Route path="/tax-upload" element={<TaxUploadPage />} />
      <Route path="/tax-intake" element={<TaxIntakePage />} />
      <Route path="/tax-deposit-pay" element={<TaxDepositPayPage />} />
      <Route path="/tax-diagnostic" element={<TaxDiagnosticPage />} />
      <Route path="/vault-upload" element={<VaultUploadPage />} />
      <Route path="/client/login" element={<ClientLogin />} />
      <Route path="/client-setup" element={<ClientSetupPage />} />
      <Route path="/client" element={<ClientPortal />} />
      <Route path="/specialist/login" element={<SpecialistLogin />} />
      <Route path="/specialist" element={<SpecialistPortal />} />
      <Route path="/tax-planner/login" element={<TaxPlannerLogin />} />
      <Route path="/tax-planner" element={<TaxPlannerPortal />} />
      <Route path="/tax-planner/client/:clientId" element={<KeyedClientDetail />} />
      <Route path="/tax-planner/member/:memberNumber" element={<PlannerMemberView />} />
      <Route path="/specialist-ddc-help" element={<SpecialistDdcHelpPage />} />
      <Route path="/specialist-revshare-final" element={<SpecialistRevShareFinalPage />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
    </Suspense>
    <MemberHelpMount />
    </>
  )
}