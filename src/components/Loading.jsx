import React from 'react'

// STYLES
import '../styles/loading.css'

function Loading() {
    return (
        <div className='comp-loading'>
            <div className="loader">
                <span className="element"></span>
                <span className="element "></span>
                <span className="element"></span>
            </div>
        </div>
    )
}

export default Loading
