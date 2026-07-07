import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

export default function Layout({ children }) {
  return (
    <div className="bg-[#F8FAFC] text-[#0F172A] h-screen w-screen overflow-hidden flex antialiased">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <TopBar />
        {children}
      </main>
    </div>
  );
}
