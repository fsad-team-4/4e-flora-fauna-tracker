import { Navigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';

export default function ProtectedRoute({ children, roles }) {
    const { user } = useUser();
    if (!user) return <Navigate to="/login" replace />;
    if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
    return children;
}
