import React, { useEffect, useState } from 'react';
import { jobAPI, applicationAPI } from '../services/api';
import { Briefcase, Plus } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../contexts/AuthContext';

const RecruitmentPage = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isJobDialogOpen, setIsJobDialogOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: '',
    department_id: '',
    description: '',
    requirements: '',
    experience_required: '',
    salary_range: '',
    location: '',
    employment_type: 'full-time',
    posted_by: user?.id || ''
  });

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await jobAPI.getAll();
      setJobs(response.data);
    } catch (error) {
      toast.error('Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleJobSubmit = async (e) => {
    e.preventDefault();
    try {
      await jobAPI.create({...jobForm, posted_by: user?.id || 'admin'});
      toast.success('Job posted successfully');
      setIsJobDialogOpen(false);
      fetchJobs();
    } catch (error) {
      toast.error('Failed to post job');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6" data-testid="recruitment-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Recruitment</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Manage job postings and applications</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'hr') && (
          <Dialog open={isJobDialogOpen} onOpenChange={setIsJobDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="post-job-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                <Plus size={20} className="mr-2" /> Post Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Post New Job</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleJobSubmit} className="space-y-4">
                <div>
                  <Label>Job Title</Label>
                  <Input
                    value={jobForm.title}
                    onChange={(e) => setJobForm({...jobForm, title: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Department ID</Label>
                  <Input
                    value={jobForm.department_id}
                    onChange={(e) => setJobForm({...jobForm, department_id: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={jobForm.description}
                    onChange={(e) => setJobForm({...jobForm, description: e.target.value})}
                    rows={4}
                    required
                  />
                </div>
                <div>
                  <Label>Requirements</Label>
                  <Textarea
                    value={jobForm.requirements}
                    onChange={(e) => setJobForm({...jobForm, requirements: e.target.value})}
                    rows={3}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Experience Required</Label>
                    <Input
                      value={jobForm.experience_required}
                      onChange={(e) => setJobForm({...jobForm, experience_required: e.target.value})}
                      placeholder="2-5 years"
                      required
                    />
                  </div>
                  <div>
                    <Label>Salary Range</Label>
                    <Input
                      value={jobForm.salary_range}
                      onChange={(e) => setJobForm({...jobForm, salary_range: e.target.value})}
                      placeholder="5-8 LPA"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={jobForm.location}
                      onChange={(e) => setJobForm({...jobForm, location: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Employment Type</Label>
                    <Select value={jobForm.employment_type} onValueChange={(value) => setJobForm({...jobForm, employment_type: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-time">Full Time</SelectItem>
                        <SelectItem value="part-time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Post Job</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Job Listings */}
      <div className="grid grid-cols-1 gap-6">
        {jobs.length === 0 ? (
          <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center">
            <Briefcase size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Job Postings</h3>
            <p className="text-[#6A625E]">Post your first job to start recruiting</p>
          </div>
        ) : (
          jobs.map((job) => (
            <div key={job.id} className="bg-white border border-[#E8E2D9] rounded-2xl p-6 lg:p-8 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(42,38,36,0.1)] transition-all duration-300">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#D96C5B]/10 flex items-center justify-center flex-shrink-0">
                      <Briefcase size={24} className="text-[#D96C5B]" weight="duotone" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-[#2A2624] mb-2" style={{ fontFamily: 'Outfit' }}>{job.title}</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="badge badge-info">{job.employment_type}</span>
                        <span className="badge badge-success">{job.location}</span>
                        <span className="badge badge-warning">{job.experience_required}</span>
                      </div>
                      <p className="text-[#6A625E] mb-3" style={{ fontFamily: 'Manrope' }}>{job.description}</p>
                      <p className="text-sm text-[#A28B7A]" style={{ fontFamily: 'Manrope' }}>
                        <strong>Salary:</strong> {job.salary_range}
                      </p>
                    </div>
                  </div>
                </div>
                <Button className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl" data-testid={`apply-job-${job.id}`}>
                  View Applications
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RecruitmentPage;
