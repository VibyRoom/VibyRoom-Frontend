import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router-dom'

import { HomePage } from './pages/HomePage'
import { CreateRoomPage } from './pages/CreateRoomPage'
import { InvitePage } from './pages/InvitePage'
import { RoomPage } from './pages/RoomPage'

function RoomRoute() {
  const { roomId } = useParams()

  if (!roomId) {
    return <Navigate to="/" replace />
  }

  return <RoomPage key={roomId} />
}

function App() {
  return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
              path="/rooms/create"
              element={<CreateRoomPage />}
          />
          <Route
              path="/invite/:code"
              element={<InvitePage />}
          />
          <Route
              path="/rooms/:roomId"
              element={<RoomRoute />}
          />
          <Route
              path="*"
              element={<Navigate to="/" replace />}
          />
        </Routes>
      </BrowserRouter>
  )
}

export default App