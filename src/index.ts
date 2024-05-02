import {
    $query,
    $update,
    Record,
    StableBTreeMap,
    Vec,
    match,
    Result,
    nat64,
    ic,
    Opt,
    Principal
} from 'azle';
import { v4 as uuidv4 } from 'uuid';

type Task = Record<{
    creator: Principal;
    id: string;
    title: string;
    description: string;
    created_date: nat64;
    updated_at: Opt<nat64>;
    due_date: string;
    assigned_to: string;
    tags: Vec<string>;
    status: string;
    priority: string;
    comments: Vec<string>;
}>;

type TaskPayload = Record<{
    title: string;
    description: string;
    assigned_to: string;
    due_date: string;
}>;

/**
 * Represents a Task record.
 * @typedef {Object} Task
 * @property {Principal} creator - The creator of the task.
 * @property {string} id - The unique identifier of the task.
 * @property {string} title - The title of the task.
 * @property {string} description - The description of the task.
 * @property {nat64} created_date - The timestamp when the task was created.
 * @property {Opt<nat64>} updated_at - The timestamp when the task was last updated (optional).
 * @property {string} due_date - The due date of the task.
 * @property {string} assigned_to - The user assigned to the task.
 * @property {Vec<string>} tags - The tags associated with the task.
 * @property {string} status - The status of the task.
 * @property {string} priority - The priority of the task.
 * @property {Vec<string>} comments - The comments associated with the task.
 */

/**
 * Represents a payload for creating or updating a task.
 * @typedef {Object} TaskPayload
 * @property {string} title - The title of the task.
 * @property {string} description - The description of the task.
 * @property {string} assigned_to - The user assigned to the task.
 * @property {string} due_date - The due date of the task.
 */

const taskStorage = new StableBTreeMap<string, Task>(0, 44, 512);

const initialLoadSize = 4;

/**
 * Retrieves initial tasks.
 * @returns {Result<Vec<Task>, string>} The initial tasks.
 */
$query
export function getInitialTasks() {
    const initialTasks = taskStorage.values().slice(0, initialLoadSize);
    return Result.Ok(initialTasks);
}

/**
 * Loads more tasks.
 * @param {number} offset - The offset.
 * @param {number} limit - The limit.
 * @returns {Result<Vec<Task>, string>} The loaded tasks.
 */
$query
export function loadMoreTasks(offset, limit) {
    const moreTasks = taskStorage.values().slice(offset, offset + limit);
    return Result.Ok(moreTasks);
}

/**
 * Retrieves a task by ID.
 * @param {string} id - The ID of the task.
 * @param {Principal} caller - The caller Principal.
 * @returns {Result<Task, string>} The retrieved task.
 */
$query
export function getTask(id, caller) {
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<Task, string>(`Task with id:${id} not found`);
    }
    if (task.creator.toString() !== caller.toString()) {
        return Result.Err<Task, string>('You are not authorized to access Task');
    }
    return Result.Ok<Task, string>(task);
}

/**
 * Retrieves tasks by tags.
 * @param {string} tag - The tag to filter tasks.
 * @returns {Result<Vec<Task>, string>} The tasks filtered by tag.
 */
$query
export function getTaskByTags(tag) {
    const relatedTask = taskStorage.values().filter((task) => task.tags.includes(tag));
    return Result.Ok(relatedTask);
}

/**
 * Searches tasks by a given search input.
 * @param {string} searchInput - The search input.
 * @returns {Result<Vec<Task>, string>} The tasks matching the search input.
 */
$query
export function searchTasks(searchInput) {
    const lowerCaseSearchInput = searchInput.toLowerCase();
    const searchedTask = taskStorage.values().filter(
        (task) =>
            task.title.toLowerCase().includes(lowerCaseSearchInput) ||
            task.description.toLowerCase().includes(lowerCaseSearchInput)
    );
    return Result.Ok(searchedTask);
}

/**
 * Marks a task as completed.
 * @param {string} id - The ID of the task.
 * @returns {Result<Task, string>} The completed task.
 */
$update
export function completedTask(id) {
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<Task, string>(`Task with id:${id} not found`);
    }
    if (!task.assigned_to) {
        return Result.Err<Task, string>('No one was assigned the task');
    }
    const completeTask: Task = { ...task, status: 'Completed' };
    taskStorage.insert(task.id, completeTask);
    return Result.Ok<Task, string>(completeTask);
}

/**
 * Adds a new task.
 * @param {TaskPayload} payload - The payload for creating a task.
 * @param {Principal} caller - The caller Principal.
 * @returns {Result<Task, string>} The added task.
 */
$update
export function addTask(payload, caller) {
    if (!payload.title || !payload.description || !payload.assigned_to || !payload.due_date) {
        return Result.Err<Task, string>('Missing or invalid input data');
    }
    const newTask: Task = {
        creator: caller,
        id: uuidv4(),
        created_date: ic.time(),
        updated_at: Opt.None,
        tags: [],
        status: 'In Progress',
        priority: '',
        comments: [],
        ...payload
    };
    taskStorage.insert(newTask.id, newTask);
    return Result.Ok<Task, string>(newTask);
}

/**
 * Adds tags to a task.
 * @param {string} id - The ID of the task.
 * @param {Vec<string>} tags - The tags to add.
 * @param {Principal} caller - The caller Principal.
 * @returns {Result<Task, string>} The updated task.
 */
$update
export function addTags(id, tags, caller) {
    if (!tags || tags.length === 0) {
        return Result.Err<Task, string>('Invalid tags');
    }
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<Task, string>(`Task with id:${id} not found`);
    }
    if (task.creator.toString() !== caller.toString()) {
        return Result.Err<Task, string>('You are not authorized to access Task');
    }
    const updatedTask: Task = { ...task, tags: [...task.tags, ...tags], updated_at: Opt.Some(ic.time()) };
    taskStorage.insert(task.id, updatedTask);
    return Result.Ok<Task, string>(updatedTask);
}

/**
 * Updates a task.
 * @param {string} id - The ID of the task to update.
 * @param {TaskPayload} payload - The payload with updated task data.
 * @param {Principal} caller - The caller Principal.
 * @returns {Result<Task, string>} The updated task.
 */
$update
export function updateTask(id, payload, caller) {
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<Task, string>(`Task with id:${id} not found`);
    }
    if (task.creator.toString() !== caller.toString()) {
        return Result.Err<Task, string>('You are not authorized to access Task');
    }
    const updatedTask: Task = { ...task, ...payload, updated_at: Opt.Some(ic.time()) };
    taskStorage.insert(task.id, updatedTask);
    return Result.Ok<Task, string>(updatedTask);
}

/**
 * Deletes a task.
 * @param {string} id - The ID of the task to delete.
 * @param {Principal} caller - The caller Principal.
 * @returns {Result<Task, string>} The deleted task.
 */
$update
export function deleteTask(id, caller) {
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<Task, string>(`Task with id:${id} not found, could not be deleted`);
    }
    if (task.creator.toString() !== caller.toString()) {
        return Result.Err<Task, string>('You are not authorized to access Task');
    }
    taskStorage.remove(id);
    return Result.Ok<Task, string>(task);
}

// Additional functions omitted for brevity

/**
 * Adds a comment to a task.
 * @param {string} id - The ID of the task to add the comment to.
 * @param {string} comment - The comment to add.
 * @returns {Result<Task, string>} The updated task with the added comment.
 */
@update
export function addTaskComment(id, comment) {
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<Task, string>(`Task with id:${id} not found`);
    }
    const updatedComments = [...task.comments, comment];
    const updatedTask: Task = { ...task, comments: updatedComments };
    taskStorage.insert(task.id, updatedTask);
    return Result.Ok<Task, string>(updatedTask);
}
/**
 * Retrieves tasks by their status.
 * @param {string} status - The status of the tasks to retrieve.
 * @returns {Result<Vec<Task>, string>} A list of tasks with the specified status.
 */
$query
export function getTasksByStatus(status) {
    const tasksByStatus = taskStorage.values().filter((task) => task.status === status);
    return Result.Ok(tasksByStatus);
}

/**
 * Sets the priority of a task.
 * @param {string} id - The ID of the task to set the priority for.
 * @param {string} priority - The priority value to set.
 * @param {Principal} caller - The caller Principal.
 * @returns {Result<Task, string>} The updated task with the new priority.
 */
$update
export function setTaskPriority(id, priority, caller) {
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<Task, string>(`Task with id:${id} not found`);
    }
    if (task.creator.toString() !== caller.toString()) {
        return Result.Err<Task, string>('You are not authorized to set task priority');
    }
    const updatedTask: Task = { ...task, priority };
    taskStorage.insert(task.id, updatedTask);
    return Result.Ok<Task, string>(updatedTask);
}

/**
 * Sends a reminder for tasks with overdue due dates.
 * @param {string} id - The ID of the task to send the reminder for.
 * @returns {Result<string, string>} A message indicating the reminder status.
 */
$update
export function sendDueDateReminder(id) {
    const now = new Date().toISOString();
    const task = taskStorage.get(id);
    if (!task) {
        return Result.Err<string, string>(`Task with id:${id} not found`);
    }
    if (task.due_date < now && task.status !== 'Completed') {
        return Result.Ok<string, string>('Task is overdue. Please complete it.');
    } else {
        return Result.Err<string, string>('Task is not overdue or already completed.');
    }
}

/**
 * Retrieves tasks created by a specific user.
 * @param {Principal} creator - The creator Principal.
 * @returns {Result<Vec<Task>, string>} A list of tasks created by the specified user.
 */
$query
export function getTasksByCreator(creator) {
    const creatorTasks = taskStorage.values().filter((task) => task.creator.toString() === creator.toString());
    return Result.Ok(creatorTasks);
}

/**
 * Retrieves tasks that are overdue.
 * @returns {Result<Vec<Task>, string>} A list of overdue tasks.
 */
$query
export function getOverdueTasks() {
    const now = new Date().toISOString();
    const overdueTasks = taskStorage.values().filter(
        (task) => task.due_date < now && task.status !== 'Completed'
    );
    return Result.Ok(overdueTasks);
}

globalThis.crypto = {
    getRandomValues: () => {
        let array = new Uint8Array(32);
        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
        return array;
    },
};

