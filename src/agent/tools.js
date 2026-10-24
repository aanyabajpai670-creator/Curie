import { TOOL_DEFINITIONS } from './prompts.js';

export function createAgentTools({
  taskService,
  timerService,
  confirmDelete = async () => false,
}) {
  async function executeTool(name, args = {}) {
    switch (name) {
      case 'add_task':
        return publicTask(taskService.add(args));
      case 'list_tasks':
        return taskService.list().map(publicTask);
      case 'update_task': {
        const { id, ...changes } = args;
        return publicTask(taskService.update(id, changes));
      }
      case 'complete_task':
        return publicTask(taskService.complete(args.id));
      case 'delete_task': {
        const task = taskService.list().find((item) => item.id === args.id);
        if (!task) throw new Error('Task not found');
        if (!(await confirmDelete(task)))
          return { deleted: false, cancelled: true };
        taskService.delete(args.id);
        return { deleted: true, title: task.title };
      }
      case 'set_reminder': {
        const { taskId, at, minutesBefore } = args;
        if ((at == null) === (minutesBefore == null)) {
          throw new Error(
            'Provide either an exact reminder time or minutes before due.',
          );
        }
        return publicTask(
          taskService.update(taskId, {
            reminder: at ? { at } : { minutesBefore },
          }),
        );
      }
      case 'start_timer': {
        const status = timerService.dispatch('status');
        return timerService.dispatch(
          status.status === 'paused' ? 'resume' : 'start',
        );
      }
      case 'pause_timer':
        return timerService.dispatch('pause');
      case 'stop_timer':
        return timerService.dispatch('reset');
      case 'get_timer_status':
        return timerService.dispatch('status');
      default:
        throw new Error('Unknown tool: ' + name);
    }
  }

  return { definitions: TOOL_DEFINITIONS, executeTool };
}

function publicTask(task) {
  const { id, title, subject, due, estimateMinutes, status } = task;
  return { id, title, subject, due, estimateMinutes, status };
}
