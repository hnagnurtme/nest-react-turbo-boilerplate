import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/features/auth';
import { ItemsPage } from '@/features/items';
import { RouteGuard } from '@/app/components/route-guard';
import { Layout } from '@/app/components/layout';
import { SessionExpiredHandler } from './session-expired-handler';

export function AppRouter() {
  return (
    <>
      <SessionExpiredHandler />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RouteGuard>
              <Layout>
                <ItemsPage />
              </Layout>
            </RouteGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
