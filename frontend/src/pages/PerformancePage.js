import React, { useEffect, useState } from 'react';
import { performanceAPI } from '../services/api';
import { ChartLine, Plus, Star } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { useAuth } from '../contexts/AuthContext';

const PerformancePage = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({
    employee_id: '',
    title: '',
    description: '',
    target_date: '',
    weightage: 10,
    created_by: user?.id || ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [goalsRes, reviewsRes] = await Promise.all([
        performanceAPI.getGoals(),
        performanceAPI.getReviews()
      ]);
      setGoals(goalsRes.data);
      setReviews(reviewsRes.data);
    } catch (error) {
      // It's okay if there are no goals or reviews
      setGoals([]);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGoalSubmit = async (e) => {
    e.preventDefault();
    try {
      await performanceAPI.createGoal({...goalForm, created_by: user?.id || 'admin'});
      toast.success('Goal created successfully');
      setIsGoalDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to create goal');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6" data-testid="performance-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Performance</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Track goals and reviews</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'hr' || user?.role === 'manager') && (
          <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-goal-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                <Plus size={20} className="mr-2" /> Add Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Performance Goal</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleGoalSubmit} className="space-y-4">
                <div>
                  <Label>Employee ID</Label>
                  <Input
                    value={goalForm.employee_id}
                    onChange={(e) => setGoalForm({...goalForm, employee_id: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Goal Title</Label>
                  <Input
                    value={goalForm.title}
                    onChange={(e) => setGoalForm({...goalForm, title: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={goalForm.description}
                    onChange={(e) => setGoalForm({...goalForm, description: e.target.value})}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Target Date</Label>
                    <Input
                      type="date"
                      value={goalForm.target_date}
                      onChange={(e) => setGoalForm({...goalForm, target_date: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Weightage (%)</Label>
                    <Input
                      type="number"
                      value={goalForm.weightage}
                      onChange={(e) => setGoalForm({...goalForm, weightage: parseInt(e.target.value)})}
                      min="1"
                      max="100"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Create Goal</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Active Goals</p>
          <p className="text-3xl font-semibold text-[#2A2624]">{goals.length}</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Completed Reviews</p>
          <p className="text-3xl font-semibold text-[#2A2624]">{reviews.length}</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Average Rating</p>
          <p className="text-3xl font-semibold text-[#2A2624]">4.5/5</p>
        </div>
      </div>

      {/* Performance Goals */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="p-6 border-b border-[#E8E2D9]">
          <h3 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Performance Goals</h3>
        </div>
        {goals.length === 0 ? (
          <div className="p-12 text-center">
            <ChartLine size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Goals Set</h3>
            <p className="text-[#6A625E]">Create performance goals to track progress</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {goals.map((goal) => (
              <div key={goal.id} className="border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-[#2A2624] mb-1">{goal.title}</h4>
                    <p className="text-sm text-[#6A625E] mb-2">{goal.description}</p>
                    <div className="flex gap-2">
                      <span className="badge badge-info">Weight: {goal.weightage}%</span>
                      <span className="badge badge-success">{goal.status}</span>
                    </div>
                  </div>
                  <div className="text-sm text-[#A28B7A]">
                    Target: {new Date(goal.target_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Reviews */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="p-6 border-b border-[#E8E2D9]">
          <h3 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Performance Reviews</h3>
        </div>
        {reviews.length === 0 ? (
          <div className="p-12 text-center">
            <Star size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Reviews Yet</h3>
            <p className="text-[#6A625E]">Performance reviews will appear here</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="border border-[#E8E2D9] rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-[#2A2624]">{review.review_period}</p>
                    <p className="text-sm text-[#6A625E]">Reviewed by: {review.reviewer_id}</p>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Star size={20} className="text-[#E8B25C]" weight="fill" />
                    <span className="text-lg font-semibold text-[#2A2624]">{review.rating}/5</span>
                  </div>
                </div>
                <p className="text-sm text-[#6A625E] mb-2">{review.comments}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-[#2A2624] uppercase mb-1">Strengths</p>
                    <p className="text-sm text-[#6A625E]">{review.strengths}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#2A2624] uppercase mb-1">Areas for Improvement</p>
                    <p className="text-sm text-[#6A625E]">{review.areas_of_improvement}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformancePage;
