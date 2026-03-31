import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Youtube, FileText, Zap, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Youtube className="w-8 h-8 text-red-600" />
          <span className="text-xl font-bold tracking-tight">SummifyYT</span>
        </div>
        <div className="flex items-center gap-4">
          <Link 
            to="/app" 
            className="text-sm font-medium bg-zinc-900 text-white px-4 py-2 rounded-full hover:bg-zinc-800 transition-colors"
          >
            Open App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 max-w-4xl mx-auto leading-tight">
            Turn hours of video into <span className="text-red-600">minutes of reading.</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-500 mb-10 max-w-2xl mx-auto">
            Paste any YouTube URL and get a clean, concise summary powered by Hugging Face AI. Save time and extract the knowledge you need instantly.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              to="/app" 
              className="flex items-center gap-2 bg-red-600 text-white px-8 py-4 rounded-full text-lg font-medium hover:bg-red-700 transition-all hover:scale-105"
            >
              Start Summarizing
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </motion.div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 text-left">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100"
          >
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
              <Youtube className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-xl font-bold mb-3">Any YouTube Video</h3>
            <p className="text-zinc-500">Works with any public YouTube video that has closed captions available.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100"
          >
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold mb-3">Lightning Fast</h3>
            <p className="text-zinc-500">Get your summary in seconds, not minutes. Powered by advanced AI models.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100"
          >
            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mb-6">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-3">Clean Summaries</h3>
            <p className="text-zinc-500">Read well-structured, easy-to-digest summaries that capture the core message.</p>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
