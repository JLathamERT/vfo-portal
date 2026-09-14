import { Routes, Route, Navigate } from 'react-router-dom'
import RolePicker from './pages/RolePicker'
import AdminLogin from './pages/AdminLogin'
import MemberLogin from './pages/MemberLogin'
import AdminPortal from './pages/AdminPortal'
import MemberPortal from './pages/MemberPortal'
import ClientDetail from './pages/ClientDetail'
import DecidePage from './pages/DecidePage'
import TaxDecidePage from './pages/TaxDecidePage'
import TaxImplementDecidePage from './pages/TaxImplementDecidePage'
import TaxPostReviewDecidePage from './pages/TaxPostReviewDecidePage'
import AdvisorDecidePage from './pages/AdvisorDecidePage'
import AccountantDecidePage from './pages/AccountantDecidePage'
import PftFtDecidePage from './pages/PftFtDecidePage'
import PftDecidePage from './pages/PftDecidePage'
import PftDiscoveryPage from './pages/PftDiscoveryPage'
import PayPage from './pages/PayPage'
import TaxPayPage from './pages/TaxPayPage'
import AdvisorPayPage from './pages/AdvisorPayPage'
import AccountantPayPage from './pages/AccountantPayPage'
import PipPayPage from './pages/PipPayPage'
import MemberSetupPage from './pages/MemberSetupPage'
import SetPasswordPage from './pages/SetPasswordPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import SpecialistSifPage from './pages/SpecialistSifPage'
import SpecialistPayPage from './pages/SpecialistPayPage'
import SpecialistQuestionsPage from './pages/SpecialistQuestionsPage'
import SpecialistDdcPage from './pages/SpecialistDdcPage'
import TaxUploadPage from './pages/TaxUploadPage'
import VaultUploadPage from './pages/VaultUploadPage'
import ClientLogin from './pages/ClientLogin'
import ClientSetupPage from './pages/ClientSetupPage'
import ClientPortal from './pages/ClientPortal'
import SpecialistLogin from './pages/SpecialistLogin'
import SpecialistPortal from './pages/SpecialistPortal'
import TaxPlannerLogin from './pages/TaxPlannerLogin'
import TaxPlannerPortal from './pages/TaxPlannerPortal'
import PlannerMemberView from './pages/PlannerMemberView'
import SpecialistDdcHelpPage from './pages/SpecialistDdcHelpPage'
import SpecialistRevShareFinalPage from './pages/SpecialistRevShareFinalPage'
import Map4FormPage from './pages/Map4FormPage'
import UpdateCardPage from './pages/UpdateCardPage'
import ConnectCardPage from './pages/ConnectCardPage'
import PayoutSetupPage from './pages/PayoutSetupPage'
import SpecialistRevenuePayPage from './pages/SpecialistRevenuePayPage'
import MembershipPayPage from './pages/MembershipPayPage'
import MembershipMeetingPage from './pages/MembershipMeetingPage'
import OnboardingMeetingPage from './pages/OnboardingMeetingPage'
import { MemberHelpMount } from './components/member/MemberHelpButton'

export default function App() {
  return (
    <>
    <Routes>
      <Route path="/" element={<RolePicker />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/member/login" element={<MemberLogin />} />
      <Route path="/admin" element={<AdminPortal />} />
      <Route path="/admin/client/:clientId" element={<ClientDetail />} />
      <Route path="/member" element={<MemberPortal />} />
      <Route path="/member/client/:clientId" element={<ClientDetail />} />
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
      <Route path="/vault-upload" element={<VaultUploadPage />} />
      <Route path="/client/login" element={<ClientLogin />} />
      <Route path="/client-setup" element={<ClientSetupPage />} />
      <Route path="/client" element={<ClientPortal />} />
      <Route path="/specialist/login" element={<SpecialistLogin />} />
      <Route path="/specialist" element={<SpecialistPortal />} />
      <Route path="/tax-planner/login" element={<TaxPlannerLogin />} />
      <Route path="/tax-planner" element={<TaxPlannerPortal />} />
      <Route path="/tax-planner/client/:clientId" element={<ClientDetail />} />
      <Route path="/tax-planner/member/:memberNumber" element={<PlannerMemberView />} />
      <Route path="/specialist-ddc-help" element={<SpecialistDdcHelpPage />} />
      <Route path="/specialist-revshare-final" element={<SpecialistRevShareFinalPage />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
    <MemberHelpMount />
    </>
  )
}