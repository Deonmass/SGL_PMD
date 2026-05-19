import { Trash2, Edit2, CheckCircle, Circle } from 'lucide-react';
import { Task } from '../types';

interface TaskListProps {
  tasks: Task[];
  onDelete: (id: number) => void;
  onEdit: (task: Task) => void;
}

function TaskList({ tasks, onDelete, onEdit }: TaskListProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') {
      return <CheckCircle size={20} className="text-green-600" />;
    }
    return <Circle size={20} className="text-gray-400" />;
  };

  return (
    <div>
      {tasks.map((task) => (
        <div
          key={task.id}
          className="p-4 hover:bg-gray-50 transition flex items-start gap-4 group"
        >
          <div className="flex-shrink-0 pt-1">
            {getStatusIcon(task.status)}
          </div>
          
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h3
                  className={`font-semibold text-gray-800 ${
                    task.status === 'completed' ? 'line-through text-gray-500' : ''
                  }`}
                >
                  {task.title}
                </h3>
                <p className="text-sm text-gray-600 mt-1">{task.description}</p>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => onEdit(task)}
                  className="p-2 hover:bg-blue-100 text-blue-600 rounded transition"
                  title="Éditer"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="p-2 hover:bg-red-100 text-red-600 rounded transition"
                  title="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <span className={`text-xs px-2 py-1 rounded font-semibold ${getPriorityColor(task.priority)}`}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 font-semibold">
                {task.status === 'completed' ? 'Complétée' : task.status === 'in-progress' ? 'En cours' : 'À faire'}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TaskList;
