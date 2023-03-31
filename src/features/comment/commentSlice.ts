import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { findFileIdFromPath } from '../window/fileUtils'
import { CommentFunction, CommentState, FullState } from '../window/state'

import { API_ROOT, streamSource } from '../../utils'

const initialState: CommentState = {
    fileThenNames: {},
}

export const updateCommentsForFile = createAsyncThunk(
    'comments/updateCommentsForFile',
    async (payload: { filePath: string }, { getState, dispatch }) => {
        const state = getState() as FullState
        const global = state.global
        const fileId = findFileIdFromPath(global, payload.filePath)
        if (fileId == null) return
        const contents = global.fileCache[fileId].contents
        let cachedComments = state.commentState.fileThenNames[payload.filePath]
        if (cachedComments == null) {
            //@ts-ignore
            cachedComments = await connector.loadComments(payload.filePath)
            dispatch(
                updateComments({
                    filePath: payload.filePath,
                    comments: cachedComments,
                })
            )
        }
        cachedComments = cachedComments || {}

        const response = await fetch(`${API_ROOT}/comment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: `repo_path=${state.global.rootPath}`,
            },
            //credentials: 'include',
            body: JSON.stringify({
                toComment: contents,
                filename: payload.filePath,
                cachedComments: cachedComments,
            }),
        })
        const getNextToken = async () => {
            const rawResult = await generator.next()
            if (rawResult.done) return null
            return rawResult.value
        }

        const generator = streamSource(response)
        let line = await getNextToken()
        while (line != null) {
            const {
                function_name: name,
                function_body: body,
                comment,
                description,
            } = line as any
            dispatch(
                updateSingleComment({
                    filePath: payload.filePath,
                    functionName: name,
                    commentFn: {
                        originalFunctionBody: body,
                        comment: comment.trim(),
                        description: description.trim(),
                    },
                })
            )
            line = await getNextToken()
        }

        dispatch(saveComments({ path: payload.filePath }))
    }
)

export const saveComments = createAsyncThunk(
    'comments/saveComments',
    async (payload: { path: string }, { getState, dispatch }) => {
        const state = getState() as FullState
        //@ts-ignore
        connector.saveComments({
            path: payload.path,
            blob: state.commentState.fileThenNames[payload.path],
        })
    }
)

export const addCommentToDoc = createAsyncThunk(
    'comments/addCommentsToDoc',
    async (
        payload: { filePath: string; functionName: string },
        { getState, dispatch }
    ) => {
        dispatch(afterAddCommentToDoc(payload))
        dispatch(saveComments({ path: payload.filePath }))
    }
)

export const commentSlice = createSlice({
    name: 'commentState',
    initialState: initialState as CommentState,
    reducers: {
        afterAddCommentToDoc(
            state,
            action: PayloadAction<{ filePath: string; functionName: string }>
        ) {
            const commentFn =
                state.fileThenNames[action.payload.filePath][
                    action.payload.functionName
                ]
            if (commentFn == null) return
            commentFn.marked = true
        },
        updateComments(
            state,
            action: PayloadAction<{
                filePath: string
                comments: { [key: string]: CommentFunction }
            }>
        ) {
            state.fileThenNames[action.payload.filePath] =
                action.payload.comments
        },
        updateSingleComment(
            state,
            action: PayloadAction<{
                filePath: string
                functionName: string
                commentFn: CommentFunction
            }>
        ) {
            if (state.fileThenNames[action.payload.filePath] == null) {
                state.fileThenNames[action.payload.filePath] = {}
            }
            state.fileThenNames[action.payload.filePath][
                action.payload.functionName
            ] = action.payload.commentFn
        },
    },
})

export const { updateComments, updateSingleComment, afterAddCommentToDoc } =
    commentSlice.actions
